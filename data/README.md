# Data Directory
This data directory is where the server will store persisent information. This includes:
- `worlds.json` - [LORE] Contains persistent world info, like characters, deities, locations, and factions.
- `players.json` - [META/LORE] Stores players info. Semi-implemented but not yet used for anything.
- `rooms.json` - [META] Stores room info. Not yet implemented but will be used for savegames in the future.
- `last_gen.json` - [META] Stores the latest entire generation by the AI. Useful for debugging.
- `token_audit.json` - [META] Stores token input/output count, alongside some generalized usage rates.