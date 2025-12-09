# GAOL
## About
*GAOL is an otherworldly storyweaver bringing drama and adventure to the worlds of his creation.*  
  
Embark on adventures with a party of up to 6 players through persistent worlds. You define your characters, ambitions, and even the secrets you keep from your allies. GAOL will determine the fate of your characters actions and outcomes.

GAOL is a multiplayer AI storyteller based on the *AI Dungeon* Multiplayer and *Death By AI* gameplay. GAOL uses a turn-based system where all player inputs are taken into account to determine the course of action, and uses a novel status system to update your characters and the world as a result.

### Worlds
You start by creating new worlds, where you can define a general setting and "realism" factor to influence the AI generations. GAOL will remember major events and changes to create a grand sense of scope and scale as you embark on multiple adventures within them. Worlds can be ruined, restored, and influenced drastically by the decisions you make in your adventures.

### Characters
Begin each new adventure by defining your character with a brief summary, some tags, an overall ambition (or lack thereof), and some secrets. Every bit of information will be taken into account while the story is being weaved. GAOL will update your characters summary, tags, and statuses as you adventure to create dynamic and evolving characters across their journey.

### Party
Supporting parties of up to 6 players, GAOL will take into account every player's choices and characters when deciding on the outcome of a situation. The irreverant GAOL will take no sides on the party members, he'll stand by while they destroy one another, or work together to achieve their ambitions.

## Setup
You will need to populate the `.env` file in order to make API calls using the server. This must be populated with a Flask key (of your choosing) for running your server API and a Google Gemini Key which can be found [here](https://aistudio.google.com/).
### Commands
**Client**  
From `./client` :
```
npm install
npm run dev
```
 
This will run a vite development environment on port 5173.  

**Server**  
From the project root:
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
This will run the server backend for the API calls on port 5000.
