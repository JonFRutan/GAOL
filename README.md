# GAOL
A recreation of the AI Dungeon Multiplayer featuring a unique custom storyteller named GAOL.  
GAOL (the software not the entity) is built to accomodate a party of up to 6 players while tracking their health and status effects. It operates on a turn-key based system, requiring every player to input their move before "distilling" their actions and providing the outcome. It accomplishes more than a usual generation by generating responses as JSON objects that can contain more information than just the story text response.  

GAOL currently uses Googles Gemini API for it's storyteller responses.
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
