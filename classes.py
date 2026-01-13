#jfr
#This is for storing data classes, to simplify the content of 'app.py'
import random, string


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

#storing persistent world data, major events, setting, description, etc.
class World:
    def __init__(self, name, setting="Medieval Fantasy", realism="High", description="A mysterious realm.", width=1024, height=512):
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

        if custom_api_key:
            self.ai_client =  genai.Client(api_key=custom_api_key)
        elif DEFAULT_API_KEY:
            self.ai_client = genai.Client(api_key=custom_api_key)
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