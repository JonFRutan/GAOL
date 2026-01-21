#jfr
#This is for storing data classes, to simplify the content of 'app.py'
import random, string, os
from google         import genai
from dotenv         import load_dotenv

#generic class for locations, cities, landmarks, etc.
class WorldEntity:
    def __init__(self, name, type_tag, description, keywords=[]):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        self.name = name
        self.type_tag = type_tag # e.g. "Faction", "City", "NPC"
        self.description = description
        #keywords help the relevance engine find this without exact name matches
        #e.g. for "Thieves Guild", keywords might be ["crime", "steal", "thieve"]
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

#Biology that lives within the world, flora & fauna
class Biology:
    def __init__(self, name, description, habitat, disposition):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        self.name = name
        self.description = description
        self.habitat = habitat
        self.disposition = disposition
    
    def to_dict(self):
        return {
            "name": self.name,
            "description" : self.description,
            "habitat": self.habitat,
            "disposition" : self.disposition
        }

#storing persistent world data, major events, setting, description, etc.
class World:
    def __init__(self, name, setting="Medieval Fantasy", realism="High", description="A mysterious realm.", width=1024, height=512):
        self.id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))   #randomly generated ID to distinguish the world
        self.name = name                                                                 #name of the world (e.g. Middle Earth)
        self.setting = setting                                                           #world's setting (e.g. Cyberpunk metropolis)
        self.realism = realism                                                           #how realistic should the world behave? (High, Mid, Low) determines how wacky the world should behave
        self.description = description                                                   #description of the planet (THIS DOESN'T POPULATE OR DO ANYTHING AT THE MOMENT)
        self.major_events = []                                                           #a list of major world events that should remain persistent across playthroughs. (e.g. volcano covering planet with ash)
        self.groups = []                                                                 #list of WorldEntity objects (Abstract concepts: Factions, Gods)
        self.characters = []                                                             #list of characters within the world
        self.locations = []                                                              #list of Location objects (Physical places with coordinates)
        self.biology = []                                                                #list of Biology that lives within the world
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
    def add_group(self, name, type_tag, description, keywords=[]):
        #safety check for keywords
        if not isinstance(keywords, list):
            keywords = []
            
        #no duplicates
        if any(e.name.lower() == name.lower() for e in self.groups):
            print(f"[LORE SKIP] Duplicate entity detected: {name}")
            return
            
        new_entity = WorldEntity(name, type_tag, description, keywords)
        self.groups.append(new_entity)
        print(f"[DEBUG] Entity Added to Memory: {name} ({type_tag})")

    #adding a new physical location to the world
    def add_location(self, name, type_tag, description, x, y, radius, affiliation="Independent", keywords=[]):
        #make sure name is unique
        if any(l.name.lower() == name.lower() for l in self.locations):
            return
        new_loc = Location(name, type_tag, description, x, y, radius, affiliation, keywords)
        self.locations.append(new_loc)
        print(f"[DEBUG] Location Added: {name} at {x},{y}")

    #adding characters to the world entitites
    def add_character(self, name, description, role, affiliation, status="Alive"):
        #make sure name is unique
        if any(c.name.lower() == name.lower() for c in self.characters):
            return
        new_character = Character(name, description, role, affiliation, status)
        self.characters.append(new_character)

    #adding new biology to the world
    def add_biology(self, name, description, habitat, disposition):
        #make sure name is unique
        if any(b.name.lower() == name.lower() for b in self.biology):
            return
        new_biology = Biology(name, description, habitat, disposition)
        self.biology.append(new_biology)
    
    #grab a list of all entity names, this is to be used for highlighting in the frontend
    def get_entity_list(self):
        entity_list = []
        for g in self.groups:
            entity_list.append(g.name)
        for c in self.characters:
            entity_list.append(c.name)
        for l in self.locations:
            entity_list.append(l.name)
        for b in self.biology:
            entity_list.append(b.name)
        return entity_list

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
            'groups': [g.to_dict() for g in self.groups],
            'characters': [c.to_dict() for c in self.characters],
            'locations': [l.to_dict() for l in self.locations],
            'biology' : [b.to_dict() for b in self.biology]
        }

#stores information about players
#this is used primarily both by the AI for player info, and by the game rooms for managing player state
class Player:
    def __init__(self, sid, username):
        self.sid = sid              #socket ID of the player for unique validations
        self.username = username    #username of the player / name of their character
        self.connect = True         #track connection status for refreshes
        self.dc_timer = None        #timer to track disconnect time
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
    
    #turn player into a dictionary, currently called by "save_players"
    def to_dict(self):
        return {
            'username': self.username,
            'hp': self.hp,
            'status': self.status,
            'inventory': self.inventory,
            'description': self.description,
            'tags' : self.tags,
            'ambition': self.ambition,
            'secret' : self.secret,
            'is_ready': self.is_ready # remember ready state
            #NOTE: we don't save SID or current_action/roll since they are session specific
            }

#store important persistent characters to the world
class Character:
    def __init__(self, name, description, role="NPC", affiliation=None, status="Alive", keywords=[]):
        self.id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))  #unique ID of the characte
        self.name = name                                                                #name of the character
        self.description = description                                                  #description of the character
        self.role = role                                                                #e.g. villain, tavern keeper, etc    
        self.affiliation = affiliation                                                  #faction / group affiliation e.g. Occultists        
        self.status = status                                                            #status of the character, alive, dead, etc.
        self.keywords = keywords                                                        #relevant keywords
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description' : self.description,
            'role' : self.role,
            'affiliation': self.affiliation,
            'status': self.status,
            'keywords': self.keywords
        }
    
#stores information about the game room
class GameRoom:
    def __init__(self, room_id, setting="Medieval Fantasy", realism="High", world_id=None, custom_api_key=None, password=None):
        #See if the default API key is there, if so grab it.
        load_dotenv()
        raw_key = os.getenv("GEMINI_API_KEY")
        #if the .env field is empty or just whitespace, treat it as none
        DEFAULT_API_KEY = raw_key.strip() if raw_key and raw_key.strip() else None

        #Room values
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
        self.is_finished = False                #becomes true once game has finalized.

        if custom_api_key:
            self.ai_client =  genai.Client(api_key=custom_api_key)
        elif DEFAULT_API_KEY:
            self.ai_client = genai.Client(api_key=DEFAULT_API_KEY)
        else:
            self.ai_client = None

        self.ai_model = "gemini-2.5-flash-lite" #ai model the room is using for generation

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
        active_players = [p for p in self.players.values() if p.connect] #see players who are actually connected to the lobby.
        #if none of the players in a lobby are connected, return false
        if not active_players:
            return False
        return all(p.has_acted for p in active_players)

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
    
    #turn the game room into a dictionary
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
    
#debugging
if __name__ == "__main__":
    worlds = {}
    import json #i know it's strange to have imports here, but I don't need it otherwise
    world_file = 'data/worlds.json'
    with open(world_file, 'r') as f:
        data = json.load(f)
        for w_id, w_data in data.items():
            #print(f"[DEBUG] Attempting to load world: {w_id}") #debug stuff
            #defaults added for backward compatibility
            #added width/height defaults
            w = World(
                w_data['name'], 
                w_data.get('setting', 'Medieval Fantasy'), 
                w_data.get('realism', 'High'), 
                w_data['description'],
                w_data.get('width', 1024),
                w_data.get('height', 512)
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
            if 'groups' in w_data:
                for e_data in w_data['groups']:
                    w.add_group(
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

            #load characters
            if 'characters' in w_data:
                for c_data in w_data['characters']:
                    c_role = c_data.get('role', 'NPC')
                    c_aff  = c_data.get('affiliation', 'None')
                    c_stat = c_data.get('status', 'Alive') 

                    #this line was crashing before because World.add_character didn't accept status
                    w.add_character(c_data['name'], c_data['description'], c_role, c_aff, c_stat)

            #load world biology
            if 'biology' in w_data:
                for b_data in w_data['biology']:
                    w.add_biology(
                        b_data['name'],
                        b_data['description'],
                        b_data['habitat'],
                        b_data['disposition']
                    )
            worlds[w_id] = w
            entity_list = w.get_entity_list()
            for entity in entity_list:
                print(entity)