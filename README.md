# GAOL
*GAOL is an otherworldly storyweaver bringing drama and adventure to the worlds of his creation.*  
  
Embark on adventures with a party of up to 6 players through persistent worlds. You define your characters, ambitions, and even the secrets you keep from your allies. GAOL will determine the fate of your characters actions and outcomes.

GAOL is a multiplayer AI storyteller based on the *AI Dungeon* Multiplayer and *Death By AI* gameplay. GAOL uses a turn-based system where all player inputs are taken into account to determine the course of action, and uses a novel status system to update your characters and the world as a result.
## Features
GAOL has a server backend and client frontend to host your own adventures. Rooms are simply to create and host, and support up to 6 players each. Each room will exist within a created world. GAOL supports hot-dropping and hot-joining users.
#### Worlds
You start by creating new worlds, where you can define a general setting and "realism" factor to influence the AI generations. GAOL will remember major events and changes to create a grand sense of scope and scale as you embark on multiple adventures within them. Worlds can be ruined, restored, and influenced drastically by the decisions you make in your adventures.

#### Characters
Begin each new adventure by defining your character with a brief summary, some tags, an overall ambition (or lack thereof), and some secrets. Every bit of information will be taken into account while the story is being weaved. GAOL will update your characters summary, tags, and statuses as you adventure to create dynamic and evolving characters across their journey.

#### Party
Supporting parties of up to 6 players, GAOL will take into account every player's choices and characters when deciding on the outcome of a situation. The irreverant GAOL will remain impartial towards the decisions, and inevitable consequences. Players should work together to achieve their ambitions, and may even be hiding secrets from one another...

## How does it work?
GAOL uses the Gemini API, specifically the `Gemini-2.5-flash` model. GAOL's server is set up with very detailed and explicit instructions to provide the API which return not just text, but a JSON object that is parsed to provide both the generated story text, and a list of updates to be done across characters and the world. These updates are reflected on the data sheets, character sheets are frequently updated and major events can even change the world sheet.

### Backend
The backend is Python using a Flask API. This handles the API calls, management of the character and world states, and game rooms. See `app.py`

### Frontend
The frontend is a Vite environment written in Javascript and using NPM. See `./client/src/App.jsx` and `./client/src/App.css`.

## Setup
You will need to populate the `.env` file in order to make API calls using the server. This must be populated with a Flask key (of your choosing) for running your server API and a Google Gemini Key which can be found [here](https://aistudio.google.com/). This **DOES NOT** make this publicly accessible and usable, that will require hosting and port forwarding. These instructions are simply for running the application locally.
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
