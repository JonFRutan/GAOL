#jfr
import os, json, random, string
import google.generativeai as genai
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
from dotenv import load_dotenv

##############################
#         Global Data        #
##############################

load_dotenv()
#flask API
app=Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
#Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-flash')
#temp game storage
# {'room_id': GameRoom Object}
games = {}

#file path for persistent world storage
WORLDS_FILE = 'worlds.json'

#new global world storage
# {'world_id': World Object}
worlds = {} 

#Gemini configurations
generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 64,
    "max_output_tokens": 8192,
    "response_mime_type": "application/json",
}

##############################
#           Classes          #
##############################

#new class for persistent world data
class World:
    # updated to store setting and realism as persistent world data
    def __init__(self, name, setting="Medieval Fantasy", realism="High", description="A mysterious realm."):
        self.id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        self.name = name
        self.setting = setting
        self.realism = realism
        self.description = description
        self.major_events = [] 

    def add_event(self, event_text):
        self.major_events.append(event_text)
        if len(self.major_events) > 20: 
            self.major_events.pop(0)
    
    #helper to convert object to dict for json saving
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'setting': self.setting,
            'realism': self.realism,
            'description': self.description,
            'major_events': self.major_events
        }

#stores information about players, such
class Player:
    def __init__(self, sid, username):
        self.sid = sid
        self.username = username
        self.hp = 100
        self.status = "Healthy"  # e.g. Healthy, Wounded, Unconscious, Dead
        self.inventory = []
        self.current_action = None  # Stores what they typed this turn
        self.has_acted = False
        
        # New attributes for lobby/description logic
        self.description = ""
        self.is_ready = False # Used for the lobby phase

    def reset_turn(self):
        self.current_action = None
        self.has_acted = False

    def __repr__(self):
        return f"{self.username} [HP:{self.hp}] ({self.status})"

class GameRoom:
    #updated init to include setting, realism, and world binding
    def __init__(self, room_id, setting="Medieval Fantasy", realism="High", world_id=None):
        self.room_id = room_id
        self.setting = setting
        self.realism = realism
        self.world_id = world_id
        self.history = []  #list of strings or dicts
        self.players = {}  #dict: { sid: Player }
        self.is_started = False 

    def add_player(self, sid, username):
        self.players[sid] = Player(sid, username)

    def remove_player(self, sid):
        if sid in self.players:
            del self.players[sid]

    #returns true if every played has submitted an action
    def all_players_acted(self):
        if not self.players:
            return False
        return all(p.has_acted for p in self.players.values())

    #returns true if every player is ready to start (lobby phase)
    def all_players_ready(self):
        if not self.players:
            return False
        return all(p.is_ready for p in self.players.values())

    #compiles all the player actions into a single block to be submitted in the prompt
    def compile_turn_actions(self):
        actions = []
        for p in self.players.values():
            action_str = p.current_action if p.current_action else "No action taken."
            actions.append(f"- {p.username} attempts to: {action_str}")
        return "\n".join(actions)

    def reset_turns(self):
        for p in self.players.values():
            p.reset_turn()

    #generates the party status block for sending to the system prompt
    def get_party_status_string(self):
        status_lines = ["CURRENT PARTY STATUS:"]
        for p in self.players.values():
            # Included description in the status block so the AI knows who they are
            desc = f" (Desc: {p.description})" if p.description else ""
            status_lines.append(f" * {p.username}: {p.status} (HP: {p.hp}/100){desc}")
        return "\n".join(status_lines)

##############################
#      Helper Functions      #
##############################

#load worlds from json file on startup
def load_worlds():
    global worlds
    if not os.path.exists(WORLDS_FILE):
        return
    try:
        with open(WORLDS_FILE, 'r') as f:
            data = json.load(f)
            for w_id, w_data in data.items():
                # defaults added for backward compatibility
                w = World(
                    w_data['name'], 
                    w_data.get('setting', 'Medieval Fantasy'), 
                    w_data.get('realism', 'High'), 
                    w_data['description']
                )
                w.id = w_data['id'] # overwrite random id
                w.major_events = w_data['major_events']
                worlds[w_id] = w
    except Exception as e:
        print(f"Error loading worlds: {e}")

#save worlds to json file
def save_worlds():
    try:
        data = {w_id: w.to_dict() for w_id, w in worlds.items()}
        with open(WORLDS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving worlds: {e}")

def generate_ai_response(game_room, is_embark=False):
    #fetching world context for prompt
    world_context = "Unknown World"
    world_history = "No known history."
    
    if game_room.world_id and game_room.world_id in worlds:
        w = worlds[game_room.world_id]
        world_context = f"{w.name}: {w.description}"
        world_history = "\n".join([f"- {e}" for e in w.major_events])

    # set up message history to keep storyteller on track
    history_text = ""
    for msg in game_room.history:
        if isinstance(msg, dict):
            # We skip system/hidden messages in the prompt history to save tokens
            if msg.get('type') == 'story': 
                history_text += f"{msg['sender']}: {msg['text']}\n"
    
    current_actions = game_room.compile_turn_actions()
    party_stats = game_room.get_party_status_string()

    special_instructions = ""
    if is_embark:
        special_instructions = "THIS IS THE START OF THE GAME. IGNORE 'PLAYERS JUST DID'. Initialize the story by placing the party in a random starting scenario relevant to the setting (e.g. waking up in a cell, standing on a battlefield, meeting in a tavern, etc). Use the player descriptions to flavor the intro."
        current_actions = "The party is ready to begin."

    # schema enforcing prompt
    # updated prompt to include world context, settings, and world updates schema
    prompt = f"""
    You are GAOL, a Dungeon Master AI. 

    GAME SETTINGS:
    - Setting: {game_room.setting}
    - Realism Level: {game_room.realism}
    - World Context: {world_context}
    
    WORLD HISTORY (MAJOR EVENTS):
    {world_history}

    {party_stats}
    
    RECENT HISTORY:
    {history_text}
    
    PLAYERS JUST DID:
    {current_actions}
    
    {special_instructions}
    
    INSTRUCTIONS:
    1. Narrate the outcome of their actions dramatically (max 3 sentences).
    2. Update player stats if they took damage or used items.
    3. You can update a player's description (e.g., if they get scarred, change clothes, or mutate).
    4. If a MAJOR world-altering event occurs (e.g., a city falls, a god dies), add it to "world_updates".
    5. Return ONLY a JSON object with this exact schema:
    
    {{
      "story_text": "The narrative description...",
      "updates": {{
         "PlayerName": {{ "hp_change": -10, "status": "Wounded", "description": "Covered in slime" }}
      }},
      "world_updates": ["The King of Aethelgard has been assassinated."]
    }}
    
    If no status change for a player, omit them from "updates".
    """
    
    try:
        response = model.generate_content(prompt, generation_config=generation_config)
        return json.loads(response.text) # Parse JSON string to Python Dict
    except Exception as e:
        print(f"AI Error: {e}")
        return {"story_text": "The matrix glitches...", "updates": {}, "world_updates": []}
    
##############################
#         API Routes         #
##############################

#root app route
@app.route('/')
def index():
    return render_template('index.html')

##############################
#       Socket Events        #
##############################

#fetches worlds for the frontend dropdown
@socketio.on('get_worlds')
def handle_get_worlds():
    world_list = [{'id': k, 'name': v.name} for k, v in worlds.items()]
    emit('world_list', world_list)

#handles room creation logic separate from joining
@socketio.on('create_room')
def handle_create_room(data):
    room_id = data['room']
    username = data['username']
    
    # inputs from frontend
    req_setting = data.get('setting', 'Medieval Fantasy')
    req_realism = data.get('realism', 'High')
    world_selection = data.get('world_selection') 
    new_world_name = data.get('new_world_name')

    if room_id in games:
        emit('status', {'msg': 'ERROR: Room ID already exists.'})
        return

    final_world_id = None
    final_setting = req_setting
    final_realism = req_realism

    if world_selection == 'NEW':
        # Create new world with the provided settings
        w = World(
            new_world_name if new_world_name else f"World {room_id}",
            req_setting,
            req_realism
        )
        worlds[w.id] = w
        final_world_id = w.id
        save_worlds() 
    elif world_selection in worlds:
        # Load existing world and OVERRIDE provided settings
        final_world_id = world_selection
        w = worlds[final_world_id]
        final_setting = w.setting
        final_realism = w.realism
    else:
        #fallback
        if not worlds:
            w = World("Gaia", "Medieval Fantasy", "High", "The default world.")
            worlds[w.id] = w
            save_worlds() 
        final_world_id = list(worlds.keys())[0]

    games[room_id] = GameRoom(room_id, final_setting, final_realism, final_world_id)
    
    #manually trigger join logic for the creator
    #using a helper function logic here would be cleaner but keeping inline for now
    on_join({'username': username, 'room': room_id})

#someone joins a room
@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    sid = request.sid
    join_room(room)
    
    if room not in games:
        #added error handling if room doesn't exist (must create first)
        emit('status', {'msg': 'ERROR: Room does not exist. Create it first.'}, room=sid)
        return
    
    game = games[room]
    current_world = worlds[game.world_id]

    #check for duplicate username
    if any(p.username == username for p in game.players.values()):
        emit('status', {'msg': f'ERROR: Name "{username}" is taken.'}, room=sid)
        return
    
    if len(game.players) >= 6:
        emit('status', {'msg': 'CONNECTION REJECTED: ROOM FULL (MAX 6)'}, room=sid)
        return
    
    # Determine Admin Status (First player in the dict is admin)
    is_admin = False
    if len(game.players) == 0:
        is_admin = True

    game.add_player(sid, username)
    
    emit('status', {'msg': f'{username} CONNECTED.'}, room=room)
    
    #signal to frontend that join was successful so it can swap views
    emit('join_success', {
        'room': room, 
        'world': current_world.name,
        'world_details': current_world.to_dict(), #send full world details
        'is_admin': is_admin # pass admin flag to frontend
    }, room=sid)

    # Send immediate state update so the new player sees existing cards
    # Added has_acted to export
    game_state_export = [
        {'name': p.username, 'hp': p.hp, 'status': p.status, 'has_acted': p.has_acted, 'is_ready': p.is_ready, 'description': p.description} 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

#handle when a player disconnects
@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    for room_id, game in games.items():
        if sid in game.players:
            name = game.players[sid].username
            game.remove_player(sid)
            emit('status', {'msg': f'{name} disconnected.'}, room=room_id)

#handling player ready status in lobby
@socketio.on('player_ready')
def handle_player_ready(data):
    room = data['room']
    description = data['description']
    sid = request.sid
    
    if room not in games: return
    game = games[room]
    player = game.players.get(sid)
    
    if player:
        player.description = description
        player.is_ready = True
        
        #emit updated state
        game_state_export = [
            {'name': p.username, 'hp': p.hp, 'status': p.status, 'has_acted': p.has_acted, 'is_ready': p.is_ready, 'description': p.description} 
            for p in game.players.values()
        ]
        emit('game_state_update', game_state_export, room=room)
        emit('status', {'msg': f'{player.username} is READY.'}, room=room)


#handling embark logic to start the game
@socketio.on('embark')
def handle_embark(data):
    room = data['room']
    if room not in games:
        return
    
    game = games[room]
    
    # Validation: Ensure all players are ready
    if not game.all_players_ready():
        emit('status', {'msg': 'Cannot Embark: Not all players are ready.'}, room=room)
        return

    game.is_started = True
    # Clean up lobby ready flags so they don't interfere with game turn flags
    for p in game.players.values():
        p.is_ready = False
        
    emit('status', {'msg': 'INITIALIZING SCENARIO...'}, room=room)
    
    # Generate the intro
    ai_data = generate_ai_response(game, is_embark=True)
    
    story_text = ai_data.get('story_text', 'The adventure begins...')
    
    #display the current narrative to the room
    game.history.append({'sender': 'Gaol', 'text': story_text, 'type': 'story'})
    emit('message', {'sender': 'Gaol', 'text': story_text}, room=room)
    
    # Game is officially on, set status
    emit('status', {'msg': 'GAOL awaits your move...'}, room=room)
    
    # Update frontend to clear ready flags
    game_state_export = [
        {'name': p.username, 'hp': p.hp, 'status': p.status, 'has_acted': p.has_acted, 'is_ready': p.is_ready, 'description': p.description} 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

#handling player actions
@socketio.on('player_action')
def handle_action(data):
    #check to make sure the rooms and players exist
    room = data['room']
    action_text = data['message']
    sid = request.sid
    if room not in games:
        return
    game = games[room]
    player = game.players.get(sid)
    if not player:
        return
    
    #lock in players move
    player.current_action = action_text
    player.has_acted = True
    
    #notify that a player has finished submitting their action (does not display their input)
    emit('status', {'msg': f'{player.username} has locked in their move...'}, room=room)
    
    # Update game state immediately to show ready status
    game_state_export = [
        {'name': p.username, 'hp': p.hp, 'status': p.status, 'has_acted': p.has_acted, 'is_ready': p.is_ready, 'description': p.description} 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

    #see if all players have acted.
    if not game.all_players_acted():
        #we're still waiting on someone...
        pending_count = len(game.players) - sum(p.has_acted for p in game.players.values())
        emit('status', {'msg': f'Waiting for {pending_count} player(s)...'}, room=room)
    else:
        #everyone is ready
        #we compile all the player actions and their summaries to send in one block to the AI prompt
        turn_summary = game.compile_turn_actions()
        game.history.append({'sender': 'Party', 'text': turn_summary, 'type': 'story'})
        emit('message', {'sender': 'Party', 'text': turn_summary}, room=room)
        #generate the AI response in the form of a JSON file
        emit('status', {'msg': 'GAOL IS THINKING...'}, room=room)
        
        ai_data = generate_ai_response(game)
        
        #extract the story text to display on the console, and all the player object updates
        story_text = ai_data.get('story_text', 'The DM remains silent.')
        updates = ai_data.get('updates', {})
        world_updates = ai_data.get('world_updates', [])
        
        #process world updates
        if world_updates and game.world_id in worlds:
            for event in world_updates:
                worlds[game.world_id].add_event(event)
            save_worlds() # save logic if world lore changed
            #push world update to clients immediately
            emit('world_update', worlds[game.world_id].to_dict(), room=room)

        #status changes to players takes effect
        for player_name, changes in updates.items():
            #find the player by name
            target_player = next((p for p in game.players.values() if p.username == player_name), None)
            if target_player:
                if 'hp_change' in changes:
                    target_player.hp += int(changes['hp_change'])
                    #Current HP is 0-100. 
                    target_player.hp = max(0, min(100, target_player.hp))
                if 'status' in changes:
                    target_player.status = changes['status']
                if 'description' in changes:
                    target_player.description = changes['description']

        #display the current narrative to the room
        game.history.append({'sender': 'Gaol', 'text': story_text, 'type': 'story'})
        emit('message', {'sender': 'Gaol', 'text': story_text}, room=room)
        
        #reset everyones turns
        game.reset_turns()
        
        # Status back to waiting for move
        emit('status', {'msg': 'GAOL awaits your move...'}, room=room)
        
        #display the status updates for each player, and update the frontend character sheets to reflect this.
        # updated to include has_acted check (which will be false now)
        game_state_export = [
            {'name': p.username, 'hp': p.hp, 'status': p.status, 'has_acted': p.has_acted, 'is_ready': p.is_ready, 'description': p.description} 
            for p in game.players.values()
        ]
        emit('game_state_update', game_state_export, room=room)

if __name__ == "__main__":
    load_worlds() # load json on startup
    #seed a default world
    if not worlds:
        default_world = World("GAOL-1", "Medieval Fantasy", "High", "The original timeline.")
        worlds[default_world.id] = default_world
        save_worlds()
    socketio.run(app, debug=True, port=5000)