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

#### The Dice will Decide
**(UNTESTED)** The outcome of your actions will be determined by the roll of a D20. 1 for critical failure, 20 for critical success. *This is a new addition and is currently untested.* 

## How does it work?
GAOL uses the Gemini API, specifically the `Gemini-2.5-flash` model. GAOL's server is set up with very detailed and explicit instructions to provide the API which return not just text, but a JSON object that is parsed to provide both the generated story text, and a list of updates to be done across characters and the world. These updates are reflected on the data sheets, character sheets are frequently updated and major events can even change the world sheet.

### Backend
The backend is Python using a Flask API. This handles the API calls, management of the character and world states, and game rooms. See `app.py`

### Frontend
The frontend is a Vite environment written in Javascript and using NPM. See `./client/src/App.jsx` and `./client/src/App.css`.

## Setup
GAOL can be set up on a dedicated server, or run locally to play around with the functionalities. Before anything, you should fill create and fill out a `.env` file in the project root.
```
GEMINI_API_KEY=<get from Google AI Studio>      // OPTIONAL, you can also provide one in the client
SECRET_KEY=<make up any key and put it here>    // For Flask CORS, this can be anything
VITE_SOCKET_URL=http://localhost:5000           // Replace this with your server URL
```
Setting the `GEMINI_API_KEY` in the `.env` provides a server backup for all created rooms, these can be overridden when creating rooms with your own key. If you intend to publicly host a GAOL instance I recommend leaving this blank and forcing users to use their own API keys.
  
The `VITE_SOCKET_URL` can be left as is if running locally, and will just host the server on port 5000. If you move this to a publicly accessible server, replace this field with your websites URL (I use https://gaol.jfelix.space in my case). 

### Makefile
A makefile has been provided for rebuilding and updating GAOL from the Github codebase. In my production environment I run an NGINX proxy and a system service named `gaol`, this is what controls my Gunicorn service to enable multi-threading on the Flask API. If you intend to create a public instance of GAOL I recommend you use a similar set up, I won't go into detail here as this requires much more instruction.

### Running Locally
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

## Feedback
Please let me know if you run into any bugs or issues by messaging me, or opening an issue here on GitHub!