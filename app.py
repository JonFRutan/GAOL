#jfr
print("------------------------------ GAOL v1.2 ------------------------------")
import os, json, random, string, time, re
import traceback
import google.generativeai as genai
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room as socket_leave_room
from flask_cors import CORS
from dotenv import load_dotenv

##############################
#         Global Data        #
##############################

load_dotenv()
#flask API
app = Flask(__name__, 
            static_folder='client/dist/assets', 
            template_folder='client/dist', 
            static_url_path='/assets')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

#Gemini API
#key loading from .env
raw_key = os.getenv("GEMINI_API_KEY")
#if the .env field is empty or just whitespace, treat it as none
DEFAULT_API_KEY = raw_key.strip() if raw_key and raw_key.strip() else None

#server prints to see if API key is found in the environment
if DEFAULT_API_KEY:
    print(f"[SYSTEM] Server API Key Loaded: YES (Ends with {DEFAULT_API_KEY[-4:]})")
else:
    print("[SYSTEM] Server API Key Loaded: NO (User must provide key)")

model = genai.GenerativeModel('gemini-2.5-flash-lite')

#file path for persistent data storage
#get the absolute path of the directory where app.py is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')


WORLDS_FILE = os.path.join(DATA_DIR, 'worlds.json')
ROOMS_FILE = os.path.join(DATA_DIR, 'rooms.json')
PLAYERS_FILE = os.path.join(DATA_DIR, 'players.json')
CHARACTERS_FILE = os.path.join(DATA_DIR, 'characters.json')

#new global world storage
# {'world_id': World Object}
worlds = {} 
#temp game storage
# {'room_id': GameRoom Object}
games = {}

#gemini configurations
generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 64,
    "max_output_tokens": 8192,
    "response_mime_type": "application/json",
}

########################################################################
#                            Data Classes                              #
########################################################################

#generic class for locations, cities, landmarks, etc.
class WorldEntity:
    def __init__(self, name, type_tag, description, keywords=[]):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        self.name = name
        self.type_tag = type_tag # e.g. "Faction", "City", "NPC"
        self.description = description
        #keywords help the relevance engine find this without exact name matches
        #e.g. for "Thieves Guild", keywords might be ["crime", "steal", "rogue"]
        self.keywords = keywords 
        
    def to_dict(self):
        return {
            "name": self.name,
            "type": self.type_tag,
            "description": self.description,
            "keywords": self.keywords
        }

#spatial locations on the map
class Location:
    def __init__(self, name, type_tag, description, x, y, radius=1, affiliation="Independent", keywords=[]):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        self.name = name
        self.type_tag = type_tag # e.g. "City", "Village", "Ruins"
        self.description = description
        self.x = x
        self.y = y
        self.radius = radius # Represents size/influence area
        self.affiliation = affiliation # Who controls this?
        self.keywords = keywords # For relevance engine
    
    def to_dict(self):
        return {
            "name": self.name,
            "type": self.type_tag,
            "description": self.description,
            "x": self.x,
            "y": self.y,
            "radius": self.radius,
            "affiliation": self.affiliation,
            "keywords": self.keywords
        }

#storing persistent world data, major events, setting, description, etc.
class World:
    def __init__(self, name, setting="Medieval Fantasy", realism="High", description="A mysterious realm.", width=1000, height=500):
        self.id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))   #randomly generated ID to distinguish the world
        self.name = name                                                                 #name of the world (e.g. Middle Earth)
        self.setting = setting                                                           #world's setting (e.g. Cyberpunk metropolis)
        self.realism = realism                                                           #how realistic should the world behave? (High, Mid, Low) determines how wacky the world should behave
        self.description = description                                                   #description of the planet (THIS DOESN'T POPULATE OR DO ANYTHING AT THE MOMENT)
        self.major_events = []                                                           #a list of major world events that should remain persistent across playthroughs. (e.g. volcano covering planet with ash)
        self.entities = []                                                               #list of WorldEntity objects (Abstract concepts: Factions, Gods)
        self.characters = []                                                             #list of characters within the world
        self.locations = []                                                              #list of Location objects (Physical places with coordinates)
        self.width = width                                                               #Arbitrary world width
        self.height = height                                                             #Arbitrary world height

    #adds a new event to the major events of the planet
    def add_event(self, event_data):
        #handle legacy string inputs or simple text updates by converting to dict
        if isinstance(event_data, str):
            event_data = {"title": "Historical Event", "description": event_data}
            
        self.major_events.append(event_data)
        if len(self.major_events) > 20: 
            self.major_events.pop(0)
        
    #adding a new entity to the world.
    def add_entity(self, name, type_tag, description, keywords=[]):
        #safety check for keywords
        if not isinstance(keywords, list):
            keywords = []
            
        #no duplicates
        if any(e.name.lower() == name.lower() for e in self.entities):
            print(f"[LORE SKIP] Duplicate entity detected: {name}")
            return
            
        new_entity = WorldEntity(name, type_tag, description, keywords)
        self.entities.append(new_entity)
        print(f"[DEBUG] Entity Added to Memory: {name} ({type_tag})")

    #adding a new physical location to the world
    def add_location(self, name, type_tag, description, x, y, radius, affiliation="Independent", keywords=[]):
        if any(l.name.lower() == name.lower() for l in self.locations):
            return
        new_loc = Location(name, type_tag, description, x, y, radius, affiliation, keywords)
        self.locations.append(new_loc)
        print(f"[DEBUG] Location Added: {name} at {x},{y}")

    #adding characters to the world entitites
    def add_character(self, name, description, role, affiliation, status="Alive"):
        if any(c.name.lower() == name.lower() for c in self.characters):
            return
        new_character = Character(name, description, role, affiliation, status)
        self.characters.append(new_character)
    
    #helper to convert object to dict for json saving
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'setting': self.setting,
            'realism': self.realism,
            'description': self.description,
            'width': self.width,
            'height': self.height,
            'major_events': self.major_events,
            'entities': [e.to_dict() for e in self.entities],
            'characters': [c.to_dict() for c in self.characters],
            'locations': [l.to_dict() for l in self.locations]
        }

#stores information about players
class Player:
    def __init__(self, sid, username):
        self.sid = sid              #socket ID of the player for unique validations
        self.username = username    #username of the player / name of their character
        self.connect = True         #track connection status for refreshes
        self.hp = 100               #health of the character, starts at 100, 0 is dead.
        self.status = "Healthy"     #e.g. Healthy, Wounded, Unconscious, Dead. Player starts "Healthy"
        self.inventory = []         #inventory of the character (NOTE: This is unused at the moment)
        self.current_action = None  #stores what they typed this turn
        self.current_roll = None    #dice roll for the turn
        self.has_acted = False      #true/false if they've input an action this turn
        self.description = ""       #description field
        self.tags = []              #character tags (e.g. Human, Knight, Wizard)
        self.ambition = "Unknown"   #ambition/goal of the character (e.g. conquer the world)
        self.secret = ""            #secrets of the character (hidden from other players on the character sheet)
        self.is_ready = False       #used for the lobby phase

    #reset the turn of the player, emptying their role, action, and setting their "has_acted" to false.
    def reset_turn(self):
        self.current_action = None
        self.current_roll = None
        self.has_acted = False

    #__repr__ indicates the official string represetnation of an object.
    def __repr__(self):
        return f"{self.username} [HP:{self.hp}] ({self.status})"
    
    def to_dict(self):
        return {
            'username': self.username,
            'hp': self.hp,
            'status': self.status,
            'inventory': self.inventory,
            'description': self.description,
            'tags' : self.tags,
            'ambition': self.ambition,
            'secret' : self.secret 
            #NOTE: we don't save SID or current_action/roll since they are session specific
            }

#store important persistent characters to the world
class Character:
    def __init__(self, name, description, role="NPC", affiliation=None, status="Alive"):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))  #unique ID of the characte
        self.name = name                                                                #name of the character
        self.description = description                                                  #description of the character
        self.role = role                                                                #e.g. villain, tavern keeper, etc    
        self.affiliation = affiliation                                                  #faction / group affiliation e.g. Occultists        
        self.status = status  
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description' : self.description,
            'role' : self.role,
            'affiliation': self.affiliation,
            'status': self.status
        }
    
#stores information about the game room
class GameRoom:
    def __init__(self, room_id, setting="Medieval Fantasy", realism="High", world_id=None, custom_api_key=None, password=None):
        self.room_id = room_id                  #unique ID of the room for people to join
        self.setting = setting                  #setting of the world the room is using
        self.realism = realism                  #how realistic should the room behave?
        self.world_id = world_id                #id of the loaded world
        self.custom_api_key = custom_api_key    #stores override api keys
        self.password = password                #optional password for the room
        self.history = []                       #list of strings or dicts
        self.players = {}                       #dict: { sid: Player }
        self.is_started = False                 #has the room started the gameplay loop yet?
        self.admin_sid = None                   #track who the host is
        self.dm_override = None                 #stores admin override instructions for next turn

    #add a player into the room.
    def add_player(self, sid, username):
        self.players[sid] = Player(sid, username)

    #remove a player from the room
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
            roll_info = f"Rolled: {p.current_roll}" if p.current_roll else "(No Roll)"
            actions.append(f"- {p.username} {roll_info} attempts to: {action_str}")
        return "\n".join(actions)

    #resets all the players in the lobbies turns, to start the next round
    def reset_turns(self):
        for p in self.players.values():
            p.reset_turn()

    #generates the party status block for sending to the system prompt
    def get_party_status_string(self):
        status_lines = ["CURRENT PARTY STATUS:"]
        for p in self.players.values():
            # Formatted to include tags, ambition, and secret for the AI
            tags_str = ", ".join(p.tags) if p.tags else "None"
            desc_str = f" (Summary: {p.description})" if p.description else ""
            status_lines.append(f" * {p.username}: {p.status} (HP: {p.hp}/100){desc_str}")
            status_lines.append(f"   - Tags: {tags_str}")
            status_lines.append(f"   - Ambition: {p.ambition}")
            if p.secret:
                status_lines.append(f"   - SECRET (Only known to you and player): {p.secret}")
        return "\n".join(status_lines)
    
    def to_dict(self):
        player_list = [p.username for p in self.players.values()]
        return {
            'room_id': self.room_id,
            'setting': self.setting,
            'realism': self.realism,
            'world_id': self.world_id,
            'is_started': self.is_started,
            'active_players': player_list,
            'history': self.history,
            'is_private': bool(self.password) # flag if password is set
        }

########################################################################
#                          Helper Functions                            #
########################################################################

# RelevanceEngine class
# The purpose of this class is to allow for better scoping of context so that only relevant information is sent into the prompt
# and to reduce unnecessary information from taking up token count in our prompting.
class RelevanceEngine:
    #stop words are common word that aren't relevant to our prompting, and removing them helps minimize prompt bloat and improve both efficiency and information relevancy.
    STOP_WORDS = {
        'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 
        'if', 'of', 'to', 'in', 'for', 'with', 'by', 'from', 'up', 'about', 
        'into', 'over', 'after', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    }

    #takes all the tokens submitted, cleans them, and removes stop words.
    @staticmethod
    def extract_keywords(text):
        if not text: return set()
        #clean and split text into tokens
        tokens = re.findall(r'\b\w+\b', text.lower())                         #extracts just the words, letters, and characters (removing punctuation)
        return {t for t in tokens if t not in RelevanceEngine.STOP_WORDS}     #removes all the stop words from the list of words

    #
    @staticmethod
    def get_relevant_lore(world, history_buffer, current_actions, limit=5):
        #creates search context out of recent history and the actions being taken
        search_context = history_buffer + " " + current_actions
        #distills that search context into relevant keywords for better searching
        context_keywords = RelevanceEngine.extract_keywords(search_context)
        
        #scoring out items
        #scores against major events and worldentites
        scored_items = []
        
        #process Entities
        for entity in world.entities:
            score = 0
            #check keywords in name
            entity_words = RelevanceEngine.extract_keywords(entity.name)
            score += len(entity_words.intersection(context_keywords)) * 2            #2x weight value (explicit names are high value)
            
            #check manual keywords
            if entity.keywords:
                kw_set = {k.lower() for k in entity.keywords}
                score += len(kw_set.intersection(context_keywords))                  #1x weight value
            
            #check description (lower weight)
            desc_words = RelevanceEngine.extract_keywords(entity.description)
            score += len(desc_words.intersection(context_keywords)) * 0.5            #1/2 weight value

            if score > 0:
                scored_items.append({
                    'text': f"[{entity.type_tag}] {entity.name}: {entity.description}",
                    'score': score
                })
        
        #process Locations
        for loc in world.locations:
            score = 0
            loc_words = RelevanceEngine.extract_keywords(loc.name)
            score += len(loc_words.intersection(context_keywords)) * 2
            
            #check manual keywords for locations
            if loc.keywords:
                kw_set = {k.lower() for k in loc.keywords}
                score += len(kw_set.intersection(context_keywords))

            if score > 0:
                 scored_items.append({
                    'text': f"[{loc.type_tag}] {loc.name} (at {loc.x},{loc.y}): {loc.description} [Controlled by: {loc.affiliation}]",
                    'score': score
                 })

        #process major world events (factoring in a recency bias with keyword matching)
        #since events are added sequentially, the further they are in the list the more recent they happened.
        total_events = len(world.major_events)
        for i, event in enumerate(world.major_events):
            score = 0
            
            #check if event is a dict (new format) or string (old format)
            if isinstance(event, dict):
                text_content = f"{event.get('title', '')} {event.get('description', '')}"
                display_text = f"[History] {event.get('title', 'Event')}: {event.get('description', '')}"
            else:
                text_content = event
                display_text = f"[History] {event}"

            event_words = RelevanceEngine.extract_keywords(text_content)
            score += len(event_words.intersection(context_keywords))
            
            #recency bias (events at end of list get higher base score)
            recency_score = (i / total_events) * 2 if total_events > 0 else 0
            
            final_score = score + recency_score
            
            #keep the most recent event in mind, even if it's not super relevant.
            if i == total_events - 1:
                final_score += 10 

            scored_items.append({
                'text': display_text,
                'score': final_score
            })
            
        #sort the items by their score, and slice the most relevant scorings.
        scored_items.sort(key=lambda x: x['score'], reverse=True)
        top_items = scored_items[:limit]
        
        return "\n".join([item['text'] for item in top_items])

##############################
#      Loader Functions      #
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
                print(f"[DEBUG] Attempting to load world: {w_id}") #debug stuff
                #defaults added for backward compatibility
                #added width/height defaults
                w = World(
                    w_data['name'], 
                    w_data.get('setting', 'Medieval Fantasy'), 
                    w_data.get('realism', 'High'), 
                    w_data['description'],
                    w_data.get('width', 1000),
                    w_data.get('height', 500)
                )
                w.id = w_data['id'] #overwrite random id
                
                #handle major_events. If they are strings, convert to dicts.
                w.major_events = []
                if 'major_events' in w_data:
                    for evt in w_data['major_events']:
                        if isinstance(evt, str):
                             w.add_event({"title": "Historical Event", "description": evt})
                        else:
                             w.add_event(evt)
                
                #load entities if they exist
                if 'entities' in w_data:
                    for e_data in w_data['entities']:
                        w.add_entity(
                            e_data['name'], 
                            e_data['type'], 
                            e_data['description'], 
                            e_data.get('keywords', [])
                        )
                #load locations
                if 'locations' in w_data:
                    for l_data in w_data['locations']:
                        w.add_location(
                            l_data['name'],
                            l_data['type'],
                            l_data['description'],
                            l_data.get('x', 0),
                            l_data.get('y', 0),
                            l_data.get('radius', 1),
                            l_data.get('affiliation', 'Independent'), #default to independent
                            l_data.get('keywords', [])
                        )

                if 'characters' in w_data:
                    for c_data in w_data['characters']:
                        c_role = c_data.get('role', 'NPC')
                        c_aff  = c_data.get('affiliation', 'None')
                        c_stat = c_data.get('status', 'Alive') 
                        #this line was crashing before because World.add_character didn't accept status
                        w.add_character(c_data['name'], c_data['description'], c_role, c_aff, c_stat)
                
                worlds[w_id] = w
        print(f"[SYSTEM] Loaded {len(worlds)} worlds from storage.")
    except Exception as e:
        print(f"[CRITICAL ERROR] Error loading worlds: {e}") #debug stuff
        traceback.print_exc() #debug stuff

##############################
#       Saver Functions      #
##############################

#save worlds to json file
def save_worlds():
    try:
        data = {w_id: w.to_dict() for w_id, w in worlds.items()}
        with open(WORLDS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        print("[DEBUG] Worlds saved successfully.")
    except Exception as e:
        print(f"Error saving worlds: {e}")

def save_rooms():
    try:
        data = {r_id: r.to_dict() for r_id, r in games.items()}
        with open(ROOMS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving rooms: {e}")

def save_players():
    #flattens all players from all games into one dictionary keyed by "RoomID_Username"
    try:
        all_players = {}
        for r_id, game in games.items():
            for p in game.players.values():
                unique_key = f"{r_id}_{p.username}"
                player_data = p.to_dict()
                player_data['room_ref'] = r_id # add reference to room
                all_players[unique_key] = player_data
        
        with open(PLAYERS_FILE, 'w') as f:
            json.dump(all_players, f, indent=2)
    except Exception as e:
        print(f"Error saving players: {e}")

def save_characters():
    #placeholder: currently we don't have a global character store, but this sets up the file
    try:
        #if we had a characters dict: data = {c.id: c.to_dict() for c in characters.values()}
        data = {} 
        with open(CHARACTERS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving characters: {e}")

# Master save function to trigger all saves
def save_all_data():
    save_worlds()
    save_rooms()
    save_players()
    save_characters()

#clean markdown from JSON responses
def clean_json_response(text):
    clean_text = text.strip()
    if "```json" in clean_text:
        clean_text = clean_text.replace("```json", "").replace("```", "")
    elif "```" in clean_text:
        clean_text = clean_text.replace("```", "")
    return json.loads(clean_text)

def generate_ai_response(game_room, is_embark=False):
    #fetching world context for prompt
    world_context = "Unknown World"
    #placeholder for the condensed lore
    relevant_lore_block = "No known history."
    
    current_actions = game_room.compile_turn_actions()
    
    #set up message history to keep storyteller on track
    relevant_history = [m for m in game_room.history if isinstance(m, dict) and m.get('type') == 'story']
    recent_history_msgs = relevant_history[-15:]

    history_text = ""
    for msg in recent_history_msgs:
        if isinstance(msg, dict):
            #we skip system/hidden messages in the prompt history to save tokens
            if msg.get('type') == 'story': 
                history_text += f"{msg['sender']}: {msg['text']}\n"
    
    if game_room.world_id and game_room.world_id in worlds:
        w = worlds[game_room.world_id]
        world_context = f"{w.name}: {w.description}. Map Size: {w.width}x{w.height}."
        
        #implementing the RelevanceEngine
        #this condenses the world.major_events and world.entities based on what's happening NOW
        #it scans 'history_text' and 'current_actions' to pick the most relevant lore.
        relevant_lore_block = RelevanceEngine.get_relevant_lore(w, history_text, current_actions, limit=8)

    party_stats = game_room.get_party_status_string()

    special_instructions = ""
    if is_embark:
        special_instructions = """
        THIS IS THE START OF THE GAME. IGNORE 'PLAYERS JUST DID'. 
        1. Initialize the story by placing the party in a random starting scenario relevant to the setting (e.g. waking up in a cell, standing on a battlefield, meeting in a tavern, etc). 
        2. WORLD GENERATION TASK:
           - SCAN all player descriptions, tags, and secrets for named entities (Gods, Patrons, Factions) that are missing from the World Context.
           - Generate a 'new_entities' entry for EACH one found.
           - IMPERATIVE: Use type="Deity" for Major Gods/Higher Beings, type="God" for lesser idols/demigods, and type="Faction" for guilds/groups.
           - Provide a brief description for them based on the player's text.
        """
        current_actions = "The party is ready to begin."
    
    #add the admin override if present
    if game_room.dm_override:
        special_instructions += f"""
        \n*** URGENT ADMIN OVERRIDE ***
        The Dungeon Master has explicitly commanded: {game_room.dm_override}
        PRIORITIZE THIS OVERRIDE ABOVE ALL OTHER CONTEXT. 
        If the Admin asks to change the world state, kill a player, or spawn an item, DO IT in your response.
        """

    #schema enforcing prompt
    #the prompt below is quite complicated and contains A LOT of information.
    #it should all be self-explanatory by the context and the variable names.
    #the AI model returns a JSON formatted response that the server parses in order to update player/world states. 
    prompt = f"""
    You are GAOL, a Dungeon Master AI. 

    GAME SETTINGS:
    - Setting: {game_room.setting}
    - Realism Level: {game_room.realism}
    - World Context: {world_context}
    
    RELEVANT LORE & HISTORY (Use these for context):
    {relevant_lore_block}

    {party_stats}
    
    RECENT HISTORY:
    {history_text}
    
    PLAYERS JUST DID:
    {current_actions}
    
    {special_instructions}
    
    INSTRUCTIONS:
    1. Narrate the outcome of their actions dramatically (max 4 sentences).
    2. PAY ATTENTION TO DICE ROLLS: 1 is a Critical Failure, 20 is a Critical Success, 10 is average. DO NOT REFERENCE THE ROLLED DIE OR IT'S OUTCOME IN STORY TEXT.
    3. Update player stats (HP, Status, Tags, Description) if changed.
    4. **WORLD BUILDING:** If the story introduces a NEW important Faction, City, Landmark, or NPC, you MUST create them in the JSON output.
       - Do not create entities for trivial things (e.g. "a wooden chair"). Only persistent lore.
       - "new_entities" are for Abstract concepts (Factions, Guilds, Deities).
       - "new_locations" are for PHYSICAL places (Cities, Villages, Landmarks). Provide X,Y coordinates. Include 'affiliation' (who controls it) and 'keywords'.
       - "new_characters" are for named NPCs present in the scene.
    5. **UPDATING WORLD:** Use "location_updates" to change the affiliation or description of an existing location (e.g. if a faction takes over a city).
    6. Return ONLY a JSON object with this exact schema:
    
    {{
      "story_text": "The narrative description...",
      "updates": {{
         "PlayerName": {{ "hp_change": -10, "status": "Wounded", "tags_update": ["Undead"], "description": "New appearance" }}
      }},
      "world_updates": [
          {{ "title": "King Assassinated", "description": "The King has been killed by the Iron Legion." }}
      ],
      "new_entities": [
          {{ "name": "The Iron Legion", "type": "Faction", "description": "A mercenary army.", "keywords": ["war", "mercenary", "iron"] }}
      ],
      "new_locations": [
          {{ "name": "Iron Keep", "type": "City", "description": "A fortress city.", "x": 200, "y": 450, "radius": 4, "affiliation": "Iron Legion", "keywords": ["fortress", "citadel"] }}
      ],
      "location_updates": {{
          "Iron Keep": {{ "affiliation": "The Rebellion", "description": "Now under rebel control." }}
      }},
      "new_characters": [
          {{ "name": "Garrick", "role": "Blacksmith", "affiliation": "Iron Legion", "description": "A gruff dwarf." }}
      ]
    }}
    
    7. NOT EVERYTHING NEEDS TO BE CHANGED OR UPDATED EVERY TURN. If nothing worth preserving happened to a player, world, or entity, omit them from the updates.
    """
    
    try:
        active_key = None
        #prefer room override key
        if game_room.custom_api_key and len(game_room.custom_api_key) > 10:
            active_key = game_room.custom_api_key
        #fallback to server .env key (if one exists)
        elif DEFAULT_API_KEY and len(DEFAULT_API_KEY) > 10:
            active_key = DEFAULT_API_KEY
            
        #if neither - return an error
        if not active_key:
             return {"story_text": "CRITICAL ERROR: No Gemini API Key provided. Enter one in Room Creation or check server .env config.", "updates": {}, "world_updates": []}
             
        genai.configure(api_key=active_key) #update the api_key

        response = model.generate_content(prompt, generation_config=generation_config) #generate response
        
        #----------------------------#
        #          DEBUGGING         #
        #----------------------------#
        
        #save the last raw response to disk as `./data/last_gen.json`
        #used for examining issues or just to see what the AI is generating
        try:
            debug_dump = {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "prompt": prompt,
                "raw_response": response.text
            }
            with open(os.path.join(DATA_DIR, 'last_gen.json'), 'w') as f:
                json.dump(debug_dump, f, indent=2)
        except Exception as e:
            print(f"[DEBUG ERROR] Could not dump last_gen: {e}")

        #save token inputs and outputs alongside a timestamp to get an overview of token usage.
        if response.usage_metadata:
            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            total_tokens = response.usage_metadata.total_token_count
            print(f"[PROMPT INPUT TOKENS] - {input_tokens} | [RESPONSE OUTPUT TOKENS] - {output_tokens} | [TOTAL TOKEN USAGE] - {total_tokens}")
            print(f"[TOKEN AUDIT] % of Minute Limit: {(input_tokens / 1000000) * 100:.4f}%") # based on 1M TPM limit

            try:
                audit_file = os.path.join(DATA_DIR, 'token_audit.json')
                audit_data = []
                #read existing audit log if it exists
                if os.path.exists(audit_file):
                    with open(audit_file, 'r') as f:
                        try:
                            audit_data = json.load(f)
                        except json.JSONDecodeError:
                            audit_data = [] #start fresh if corrupted
                
                #append the new entity
                audit_data.append({
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": total_tokens
                })
                
                #write back to file
                with open(audit_file, 'w') as f:
                    json.dump(audit_data, f, indent=2)
            except Exception as e:
                print(f"[AUDIT ERROR] Could not save token audit: {e}")

        #----------------------------#
        #         /DEBUGGING         #
        #----------------------------#

        return clean_json_response(response.text) #parse JSON string to Python Dict
    except Exception as e:
        print(f"AI Error: {e}")
        #return error directly to user instead of silent fallback
        return {"story_text": "Gaol has gone silent...", "updates": {}, "world_updates": []}

#helper function to process AI updates
def apply_ai_updates(game, ai_data, room_id):
    updates = ai_data.get('updates', {})
    world_updates  = ai_data.get('world_updates', [])
    new_entities   = ai_data.get('new_entities', [])
    new_locations  = ai_data.get('new_locations', [])
    location_updates = ai_data.get('location_updates', {}) # Get updates for existing locations
    new_characters = ai_data.get('new_characters', [])
    
    #debugging, sese if entites are being recognized
    print(f"[DEBUG] Processing updates for Room {room_id}. Entities: {len(new_entities)} | Locations: {len(new_locations)}")

    if game.world_id in worlds:
        world = worlds[game.world_id]
        print(f"[DEBUG] World found in memory. Proceeding with updates...")
        
        try:
            #add new world events
            for event in world_updates:
                world.add_event(event)
            
            #add new entities with robust parsing
            for ent in new_entities:
                world.add_entity(
                    ent.get('name', 'Unknown'),
                    ent.get('type', 'Organization'),
                    ent.get('description', ''),
                    ent.get('keywords', [])
                )
                print(f"[LORE] Created Entity: {ent.get('name')} | Type: {ent.get('type')}")
            
            #add new locations with coords
            for loc in new_locations:
                world.add_location(
                    loc.get('name', 'Unknown Place'),
                    loc.get('type', 'Landmark'),
                    loc.get('description', ''),
                    loc.get('x', 0),
                    loc.get('y', 0),
                    loc.get('radius', 1),
                    loc.get('affiliation', 'Independent'),
                    loc.get('keywords', [])
                )
                print(f"[LORE] Created Location: {loc.get('name')} at {loc.get('x')},{loc.get('y')}")

            #process location updates (changing affiliation, description)
            for loc_name, changes in location_updates.items():
                #find location by name
                target_loc = next((l for l in world.locations if l.name.lower() == loc_name.lower()), None)
                if target_loc:
                    if 'affiliation' in changes:
                        target_loc.affiliation = changes['affiliation']
                    if 'description' in changes:
                        target_loc.description = changes['description']
                    if 'radius' in changes:
                        target_loc.radius = changes['radius']
                    print(f"[LORE] Updated Location: {target_loc.name}")

            #add new characters
            for char in new_characters:
                world.add_character(
                    char.get('name', 'Unknown'),
                    char.get('description', ''),
                    char.get('role', 'NPC'),
                    char.get('affiliation', 'None')
                )
                print(f"[LORE] Created NPC: {char.get('name')}")
            
            save_worlds() # Persist all new lore to /data/worlds.json
            emit('world_update', world.to_dict(), room=room_id)
            
        except Exception as e:
            print(f"[CRITICAL ERROR] Failed to update world data: {e}")
            traceback.print_exc()
    else:
        print(f"[CRITICAL] World ID {game.world_id} NOT found in memory! Updates skipped.")

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
            if 'tags_update' in changes:
                target_player.tags = changes['tags_update']
            if 'ambition_update' in changes:
                target_player.ambition = changes['ambition_update']
            if 'description' in changes:
                target_player.description = changes['description']

#extracted turn processing so it can be triggered by disconnects or actions
def process_turn(room_id):
    if room_id not in games: return
    game = games[room_id]
    
    #we compile all the player actions and their summaries to send in one block to the AI prompt
    turn_summary = game.compile_turn_actions()
    game.history.append({'sender': 'Party', 'text': turn_summary, 'type': 'story'})
    emit('message', {'sender': 'Party', 'text': turn_summary}, room=room_id)
    
    #generate the AI response in the form of a JSON file
    emit('status', {'msg': 'GAOL IS THINKING...'}, room=room_id)
    
    #small sleep to allow the frontend to update the status ticker before blocking
    socketio.sleep(0.1)
    
    ai_data = generate_ai_response(game)
    apply_ai_updates(game, ai_data, room_id)
    
    #extract the story text to display on the console
    story_text = ai_data.get('story_text', 'The DM remains silent.')
    
    #clear the admin override after it has been used
    if game.dm_override:
        print(f"[ADMIN] Clearing override for room {room_id}")
        game.dm_override = None

    #display the current narrative to the room
    game.history.append({'sender': 'Gaol', 'text': story_text, 'type': 'story'})
    emit('message', {'sender': 'Gaol', 'text': story_text}, room=room_id)
    
    #reset everyones turns
    game.reset_turns()
    save_rooms()
    save_players()
    
    #status back to waiting for move
    emit('status', {'msg': 'GAOL awaits your move...'}, room=room_id)
    
    #display the status updates for each player, and update the frontend character sheets to reflect this.
    game_state_export = [
        {
            'name': p.username,                 #characters name
            'hp': p.hp,                         #characters health (x/100)
            'status': p.status,                 #characters status (Healthy, Transformed, etc.)
            'has_acted': p.has_acted,           #has the player input an action yet?
            'is_ready': p.is_ready,             #is the player ready (input action or submitted character sheet)
            'tags': p.tags,                     #characters tags
            'ambition': p.ambition,             #characters ambition/goal
            'secret': p.secret,                 #characters secrets
            'description': p.description        #characters description
        } 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room_id)

########################################################################
#                         Server Handlers                              #
########################################################################

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
    #tell the client if the server has a default .env key
    has_key = bool(DEFAULT_API_KEY and len(DEFAULT_API_KEY) > 10)
    emit('server_config', {'has_env_key': has_key})

#handles room creation logic separate from joining
@socketio.on('create_room')
def handle_create_room(data):
    room_id = data['room']
    username = data['username']
    
    #inputs from frontend
    req_setting = data.get('setting', 'Medieval Fantasy')
    req_realism = data.get('realism', 'High')
    world_selection = data.get('world_selection') 
    new_world_name = data.get('new_world_name')
    custom_api_key = data.get('custom_api_key')
    password = data.get('password') # retrieve optional password
    
    #width and height from the frontend payload (defaulting if missing)
    req_width = data.get('width', 1000)
    req_height = data.get('height', 500)

    if room_id in games:
        emit('status', {'msg': 'ERROR: Room ID already exists.'})
        return
        
    #check if a key is available from the input field or from the server environment
    has_custom_key = custom_api_key and len(custom_api_key) > 10
    has_env_key = DEFAULT_API_KEY and len(DEFAULT_API_KEY) > 10
    
    if not (has_custom_key or has_env_key):
        emit('status', {'msg': 'ERROR: API Key Required (Server has none, please provide one).'})
        return

    final_world_id = None
    final_setting = req_setting
    final_realism = req_realism

    if world_selection == 'NEW':
        #create new world with the provided settings
        w = World(
            new_world_name if new_world_name else f"World {room_id}",
            req_setting,
            req_realism,
            "A newly discovered realm.", #default description
            req_width,
            req_height
        )
        worlds[w.id] = w
        final_world_id = w.id
        save_worlds() 
    elif world_selection in worlds:
        #load existing world and OVERRIDE provided settings
        final_world_id = world_selection
        w = worlds[final_world_id]
        final_setting = w.setting
        final_realism = w.realism
    else:
        #fallback
        if not worlds:
            w = World("Gaia", "Medieval Fantasy", "High", "The default world.", 1000, 500)
            worlds[w.id] = w
            save_worlds() 
        final_world_id = list(worlds.keys())[0]

    games[room_id] = GameRoom(room_id, final_setting, final_realism, final_world_id, custom_api_key, password)
    
    #save the room after it's been created
    save_rooms()

    #manually trigger join logic for the creator
    #using a helper function logic here would be cleaner but keeping inline for now
    on_join({'username': username, 'room': room_id, 'password': password})

#someone joins a room
@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    req_password = data.get('password') # get provided password if any
    sid = request.sid
    join_room(room)
    
    if room not in games:
        #added error handling if room doesn't exist (must create first)
        emit('status', {'msg': 'ERROR: Room does not exist. Create it first.'}, room=sid)
        return
    
    game = games[room]
    
    #password protection check
    if game.password and len(game.password) > 0:
        if game.password != req_password:
            #emit a specific event asking for password
            emit('password_required', {'room': room}, room=sid)
            return

    current_world = worlds[game.world_id]

    #check for duplicate username
    if any(p.username == username for p in game.players.values()):
        emit('status', {'msg': f'ERROR: Name "{username}" is taken.'}, room=sid)
        return
    
    if len(game.players) >= 6:
        emit('status', {'msg': 'CONNECTION REJECTED: ROOM FULL (MAX 6)'}, room=sid)
        return
    
    #determine "admin" status (first played in the dict is the admin)
    is_admin = False
    if len(game.players) == 0:
        is_admin = True
        game.admin_sid = sid # Set the admin SID to the creator/first joiner

    game.add_player(sid, username)

    save_players()
    save_rooms()

    #hot-join player logic
    if game.is_started:
        p = game.players[sid]
        p.has_acted = True
        p.current_action = "Joins the party."
        p.is_ready = True #ensure they don't block checks
        emit('status', {'msg': 'Game in progress. You will join next turn.'}, room=sid)
    
    emit('status', {'msg': f'{username} CONNECTED.'}, room=room)
    
    #signal to frontend that join was successful so it can swap views
    #sending history ensures late joiners don't see the 'waiting for host' screen
    emit('join_success', {
        'room': room, 
        'world': current_world.name,
        'world_details': current_world.to_dict(), #send full world details
        'is_admin': is_admin, # pass admin flag to frontend
        'history': game.history if game.is_started else []
    }, room=sid)

    #send immediate state update so the new player sees existing cards
    game_state_export = [
        {
            'name': p.username, 
            'hp': p.hp, 
            'status': p.status, 
            'has_acted': p.has_acted, 
            'is_ready': p.is_ready, 
            'tags': p.tags,
            'ambition': p.ambition,
            'secret': p.secret,
            'description': p.description
        } 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

@socketio.on('get_rooms')
def handle_get_rooms():
    #compile a list of active rooms
    room_data = []
    for g in games.values():
        world_name = "Unknown"
        if g.world_id and g.world_id in worlds:
            world_name = worlds[g.world_id].name
            
        room_data.append({
            'id': g.room_id,
            'world': world_name,
            'setting': g.setting,
            'player_count': len(g.players),
            'is_started': g.is_started,
            'has_custom_key': bool(g.custom_api_key), #sends if the room has a custom API key
            'is_private': bool(g.password) # indicates if room is password protected
        })
    emit('room_list', room_data)

#manual leave handler to avoid ghost sockets
@socketio.on('leave_room')
def on_leave(data):
    sid = request.sid
    room_id = data.get('room')
    if room_id and room_id in games:
        #trigger the standard disconnect logic
        socket_leave_room(room_id)
        game = games[room_id]
        if game.admin_sid == sid:
            emit('room_closed', {'msg': 'The host has ended the session.'}, room=room_id)
            del games[room_id]
            save_rooms()
            return
            
        name = game.players[sid].username
        game.remove_player(sid)
        emit('status', {'msg': f'{name} has left the party.'}, room=room_id)
        
        if len(game.players) == 0:
            del games[room_id]
            save_rooms()
        else:
            save_players()
            save_rooms()
            game_state_export = [
                {
                    'name': p.username, 'hp': p.hp, 'status': p.status, 
                    'has_acted': p.has_acted, 'is_ready': p.is_ready, 
                    'tags': p.tags, 'ambition': p.ambition, 'secret': p.secret, 'description': p.description
                } 
                for p in game.players.values()
            ]
            emit('game_state_update', game_state_export, room=room_id)

#handle when a player disconnects
@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    for room_id, game in list(games.items()):
        game = games[room_id]
        if sid in game.players:
            # Check if the disconnecting player is the host (admin)
            p = game.players[sid]
            p.connected = False
            #if game.admin_sid == sid:
            #    # Emit to all players in the room that the host left
            #    emit('room_closed', {'msg': 'The host has left.'}, room=room_id)
            #    print(f"Host left. Deleting room: {room_id}")
            #    del games[room_id]
            #    save_rooms()
            #    return

            #name = game.players[sid].username
            #game.remove_player(sid)
            #emit('status', {'msg': f'{name} disconnected.'}, room=room_id)

            #delete a room if it's empty
            if len(game.players) == 0:
                print(f"Deleting empty room: {room_id}")
                del games[room_id]
                save_rooms() #update the rooms json before clearing it's data
                continue

            save_players() #make a save of the players in the room
            save_rooms()   #make a save of the rooms
            
            #push new state immediately to prevent ghost cards
            game_state_export = [
                {
                    'name': p.username, 
                    'hp': p.hp, 
                    'status': p.status, 
                    'has_acted': p.has_acted, 
                    'is_ready': p.is_ready, 
                    'tags': p.tags,
                    'ambition': p.ambition, 
                    'secret': p.secret,
                    'description': p.description
                } 
                for p in game.players.values()
            ]
            emit('game_state_update', game_state_export, room=room_id)

            #check if the game was waiting on this person
            if game.is_started and len(game.players) > 0 and game.all_players_acted():
                process_turn(room_id)

#handle user rejoin (refreshing the page, losing connection etc.)
@socketio.on('rejoin')
def handle_rejoin(data):
    username = data.get('username')
    room_id = data.get('room')
    new_sid = request.sid
    
    if room_id in games:
        game = games[room_id]
        
        #find the player object by username
        target_player = next((p for p in game.players.values() if p.username == username), None)
        
        if target_player:
            old_sid = target_player.sid
            
            #were they the room admin?
            was_admin = (game.admin_sid == old_sid)
            
            #replace old sid with new one
            if old_sid in game.players:
                del game.players[old_sid]
            
            target_player.sid = new_sid
            target_player.connected = True
            game.players[new_sid] = target_player
            
            join_room(room_id)
            
            #if they were an admin, regrant them admin privileges
            if was_admin:
                game.admin_sid = new_sid
                print(f"[ADMIN] Host {username} reconnected. Admin privileges restored.")
                
            current_world = worlds[game.world_id]
            
            #emit Success with the is_admin flag
            emit('join_success', {
                'room': room_id, 
                'world': current_world.name,
                'world_details': current_world.to_dict(), 
                'is_admin': was_admin,  #explicitly send the captured status
                'history': game.history if game.is_started else []
            }, room=new_sid)
            
            emit('status', {'msg': f'{username} reconnected.'}, room=room_id)
            
            #emit the party state immediately so the grid repopulates
            game_state_export = [
                {
                    'name': p.username, 'hp': p.hp, 'status': p.status, 
                    'has_acted': p.has_acted, 'is_ready': p.is_ready, 
                    'tags': p.tags, 'ambition': p.ambition, 'secret': p.secret, 'description': p.description
                } 
                for p in game.players.values()
            ]
            emit('game_state_update', game_state_export, room=room_id)
            return

    #if rejoin fails, force them back to login
    emit('room_closed', {'msg': 'Session expired or invalid.'}, room=new_sid)

#handling player ready status in lobby
@socketio.on('player_ready')
def handle_player_ready(data):
    room = data['room']
    sid = request.sid
    
    #inputs
    description = data.get('description', '')
    tags = data.get('tags', [])
    ambition = data.get('ambition', 'Unknown')
    secret = data.get('secret', '')
    
    if room not in games: return
    game = games[room]
    player = game.players.get(sid)
    
    if player:
        player.description = description
        player.tags = tags
        player.ambition = ambition
        player.secret = secret
        player.is_ready = True

        save_players() #save updated player data
        
        #emit updated state
        game_state_export = [
            {
                'name': p.username, 
                'hp': p.hp, 
                'status': p.status, 
                'has_acted': p.has_acted, 
                'is_ready': p.is_ready, 
                'tags': p.tags,
                'ambition': p.ambition,
                'secret': p.secret,
                'description': p.description
            } 
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
    
    #ensure all players are ready
    if not game.all_players_ready():
        emit('status', {'msg': 'Cannot Embark: Not all players are ready.'}, room=room)
        return

    game.is_started = True
    #clean up lobby ready flags so they don't interfere with game turn flags
    for p in game.players.values():
        p.is_ready = False
        
    emit('status', {'msg': 'INITIALIZING SCENARIO...'}, room=room)
    
    #generate the intro
    ai_data = generate_ai_response(game, is_embark=True)
    apply_ai_updates(game, ai_data, room)
    story_text = ai_data.get('story_text', 'The adventure begins...')
    
    #display the current narrative to the room
    game.history.append({'sender': 'Gaol', 'text': story_text, 'type': 'story'})
    emit('message', {'sender': 'Gaol', 'text': story_text}, room=room)
    
    save_rooms() #save the room and begin saving history

    #game is officially on, set status
    emit('status', {'msg': 'GAOL awaits your move...'}, room=room)
    
    #update frontend to clear ready flags
    game_state_export = [
        {
            'name': p.username, 
            'hp': p.hp, 
            'status': p.status, 
            'has_acted': p.has_acted, 
            'is_ready': p.is_ready, 
            'tags': p.tags,
            'ambition': p.ambition,
            'secret': p.secret,
            'description': p.description
        } 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

#admin story injections
@socketio.on('submit_override')
def handle_admin_override(data):
    room = data['room']
    override_text = data['text']
    sid = request.sid

    if room not in games: return
    game = games[room]
    
    #verify sender is the admin
    if game.admin_sid != sid:
        emit('status', {'msg': 'UNAUTHORIZED: Only the Admin can use God Mode.'}, room=sid)
        return

    game.dm_override = override_text
    print(f"[ADMIN] Override set for Room {room}: {override_text}")
    
    #send confirmation status to Admin
    emit('status', {'msg': 'GOD MODE ENABLED: Override queued for next turn.'}, room=sid)
    
    #broadcast whisper to the room chat
    admin_name = game.players[sid].username
    whisper_msg = {'sender': 'System', 'text': f'*{admin_name}* whispers to GAOL...', 'type': 'story'}
    #append to history so it persists
    game.history.append(whisper_msg)
    emit('message', whisper_msg, room=room)

#admin model switcher
@socketio.on('change_model')
def handle_model_change(data):
    room = data['room']
    new_model_name = data['model']
    sid = request.sid
    
    if room not in games: return
    game = games[room]
    
    #verify sender is the admin
    if game.admin_sid != sid:
        emit('status', {'msg': 'UNAUTHORIZED.'}, room=sid)
        return

    global model
    try:
        model = genai.GenerativeModel(new_model_name)
        print(f"[ADMIN] System Model Switched to: {new_model_name}")
        
        #broadcast the shift message
        shift_msg = {'sender': 'System', 'text': 'A shift occurs in the mind of GAOL...', 'type': 'story'}
        game.history.append(shift_msg)
        emit('message', shift_msg, room=room)
        emit('status', {'msg': f'Model updated to {new_model_name}'}, room=sid)
    except Exception as e:
        print(f"[ERROR] Failed to switch model: {e}")
        emit('status', {'msg': 'Error switching model.'}, room=sid)

#updating api key
@socketio.on('update_api_key')
def handle_update_api_key(data):
    room = data['room']
    new_key = data['new_key']
    sid = request.sid

    if room not in games: return
    game = games[room]

    #verify sender is the admin
    if game.admin_sid != sid:
        emit('status', {'msg': 'UNAUTHORIZED.'}, room=sid)
        return
    
    game.custom_api_key = new_key
    emit('status', {'msg': 'API Key Updated for Session.'}, room=sid)

#promoting a player to admin
@socketio.on('promote_player')
def handle_promote_player(data):
    room = data['room']
    target_name = data['target_name']
    revoke_key = data.get('revoke_key', False)
    sid = request.sid

    if room not in games: return
    game = games[room]

    if game.admin_sid != sid: return

    #find target sid
    target_sid = None
    for psid, p in game.players.items():
        if p.username == target_name:
            target_sid = psid
            break
    
    if target_sid:
        #update admin ref
        game.admin_sid = target_sid
        
        #handle key revocation
        if revoke_key:
            game.custom_api_key = None
            emit('status', {'msg': 'Previous Admin revoked the API Key.'}, room=room)

        #notify old admin
        emit('admin_update', {'is_admin': False}, room=sid)
        #notify new admin
        emit('admin_update', {'is_admin': True}, room=target_sid)
        #notify room
        emit('status', {'msg': f'ADMIN TRANSFERRED TO {target_name}'}, room=room)
        
        #Update room list data (since key might have changed)
        save_rooms()

        game_state_export = [
            {
                'name': p.username, 'hp': p.hp, 'status': p.status, 
                'has_acted': p.has_acted, 'is_ready': p.is_ready, 
                'tags': p.tags, 'ambition': p.ambition, 'secret': p.secret, 'description': p.description
            } 
            for p in game.players.values()
        ]
        emit('game_state_update', game_state_export, room=room)

#kicking a player
@socketio.on('kick_player')
def handle_kick_player(data):
    room = data['room']
    target_name = data['target_name']
    sid = request.sid
    
    if room not in games: return
    game = games[room]
    
    if game.admin_sid != sid: return
    
    #find target
    target_sid = None
    for psid, p in game.players.items():
        if p.username == target_name:
            target_sid = psid
            break
    
    if target_sid:
        #emit specific kick event to target
        emit('kicked', {'msg': 'You have been kicked by the host.'}, room=target_sid)
        
        #remove them using standard logic
        game.remove_player(target_sid)
        emit('status', {'msg': f'{target_name} was kicked.'}, room=room)
        
        save_players()
        save_rooms()
        
        #update state
        game_state_export = [
            {
                'name': p.username, 'hp': p.hp, 'status': p.status, 
                'has_acted': p.has_acted, 'is_ready': p.is_ready, 
                'tags': p.tags, 'ambition': p.ambition, 'secret': p.secret, 'description': p.description
            } 
            for p in game.players.values()
        ]
        emit('game_state_update', game_state_export, room=room)
        
#handling player actions
@socketio.on('player_action')
def handle_action(data):
    #check to make sure the rooms and players exist
    room = data['room']
    action_text = data['message']
    roll = data.get('roll', 10)
    sid = request.sid

    if room not in games:
        return
    game = games[room]
    player = game.players.get(sid)
    if not player:
        return
    
    #lock in players move
    player.current_action = action_text
    player.current_roll = roll
    player.has_acted = True
    
    #notify that a player has finished submitting their action (does not display their input)
    emit('status', {'msg': f'{player.username} has locked in their move...'}, room=room)
    
    #update game state immediately to show ready status
    game_state_export = [
        {
            'name': p.username, 
            'hp': p.hp, 
            'status': p.status, 
            'has_acted': p.has_acted, 
            'is_ready': p.is_ready, 
            'tags': p.tags, 
            'ambition': p.ambition, 
            'secret': p.secret,
            'description': p.description
        } 
        for p in game.players.values()
    ]
    emit('game_state_update', game_state_export, room=room)

    #see if all players have acted.
    if not game.all_players_acted():
        #we're still waiting on someone...
        pending_count = len(game.players) - sum(p.has_acted for p in game.players.values())
        emit('status', {'msg': f'Waiting for {pending_count} player(s)...'}, room=room)
    else:
        process_turn(room)

if __name__ == "__main__":
    load_worlds() # load json on startup
    #this forces any schema updates (like adding missing 'entities' keys) to disk immediately.
    save_worlds() 

    #seed a default world if empty
    if not worlds:
        default_world = World("GAOL-1", "Medieval Fantasy", "High", "The original timeline.")
        worlds[default_world.id] = default_world
        save_worlds()
    socketio.run(app, debug=True, port=5000)