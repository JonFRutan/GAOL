#jfr
import os, json
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

    def reset_turn(self):
        self.current_action = None
        self.has_acted = False

    def __repr__(self):
        return f"{self.username} [HP:{self.hp}] ({self.status})"

class GameRoom:
    def __init__(self, room_id):
        self.room_id = room_id
        self.history = []  #list of strings or dicts
        self.players = {}  #dict: { sid: Player }

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

    #compiles all the player actions into a single block to be submitted in the prompt
    def compile_turn_actions(self):
        actions = []
        for p in self.players.values():
            actions.append(f"- {p.username} attempts to: {p.current_action}")
        return "\n".join(actions)

    def reset_turns(self):
        for p in self.players.values():
            p.reset_turn()

    #generates the party status block for sending to the system prompt
    def get_party_status_string(self):
        status_lines = ["CURRENT PARTY STATUS:"]
        for p in self.players.values():
            status_lines.append(f" * {p.username}: {p.status} (HP: {p.hp}/100)")
        return "\n".join(status_lines)

##############################
#      Helper Functions      #
##############################

def generate_ai_response(game_room):
    # set up message history to keep storyteller on track
    history_text = ""
    for msg in game_room.history:
        if isinstance(msg, dict):
            # We skip system/hidden messages in the prompt history to save tokens
            if msg.get('type') == 'story': 
                history_text += f"{msg['sender']}: {msg['text']}\n"
    
    current_actions = game_room.compile_turn_actions()
    party_stats = game_room.get_party_status_string()

    # schema enforcing prompt
    prompt = f"""
    You are a Dungeon Master. 

    {party_stats}
    
    RECENT HISTORY:
    {history_text}
    
    PLAYERS JUST DID:
    {current_actions}
    
    INSTRUCTIONS:
    1. Narrate the outcome of their actions dramatically (max 3 sentences).
    2. Update player stats if they took damage or used items.
    3. Return ONLY a JSON object with this exact schema:
    
    {{
      "story_text": "The narrative description...",
      "updates": {{
         "PlayerName": {{ "hp_change": -10, "status": "Wounded" }}
      }}
    }}
    
    If no status change for a player, omit them from "updates".
    """
    
    try:
        response = model.generate_content(prompt, generation_config=generation_config)
        return json.loads(response.text) # Parse JSON string to Python Dict
    except Exception as e:
        print(f"AI Error: {e}")
        return {"story_text": "The matrix glitches...", "updates": {}}
    
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

#someone joins a room
@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    sid = request.sid
    join_room(room)
    
    if room not in games:
        games[room] = GameRoom(room)
    
    game = games[room]
    if len(game.players) >= 6:
        emit('status', {'msg': 'CONNECTION REJECTED: ROOM FULL (MAX 6)'}, room=sid)
        #FIXME: I don't know if this actually prevents players from joining.
        return
    
    game.add_player(sid, username)
    
    emit('status', {'msg': f'{username} CONNECTED.'}, room=room)
    
    # Send immediate state update so the new player sees existing cards
    game_state_export = [
        {'name': p.username, 'hp': p.hp, 'status': p.status} 
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
        emit('status', {'msg': 'The DM is thinking...'}, room=room)
        
        ai_data = generate_ai_response(game)
        
        #extract the story text to display on the console, and all the player object updates
        story_text = ai_data.get('story_text', 'The DM remains silent.')
        updates = ai_data.get('updates', {})
        
        #status changes to players takes effect
        for player_name, changes in updates.items():
            #find the player by name
            target_player = next((p for p in game.players.values() if p.username == player_name), None)
            if target_player:
                if 'hp_change' in changes:
                    target_player.hp += int(changes['hp_change'])
                    #Current HP is 0-100. 
                    #NOTE: This should be modifiable, it's statically capped at 100
                    target_player.hp = max(0, min(100, target_player.hp))
                if 'status' in changes:
                    target_player.status = changes['status']

        #display the current narrative to the room
        game.history.append({'sender': 'Gaol', 'text': story_text, 'type': 'story'})
        emit('message', {'sender': 'Gaol', 'text': story_text}, room=room)
        
        #display the status updates for each player, and update the frontend character sheets to reflect this.
        game_state_export = [
            {'name': p.username, 'hp': p.hp, 'status': p.status} 
            for p in game.players.values()
        ]
        emit('game_state_update', game_state_export, room=room)
    
        #reset everyones turns
        game.reset_turns()

if __name__ == "__main__":
    socketio.run(app, debug=True, port=5000)
