#jfr
#this file will be used for analyzing and calculating token usage.
import json

def return_token_usage(token_audit):
    data = json.load(token_audit)
    for index, dat in enumerate(data):
        print(dat["input"], dat["output"], dat["total"])

if __name__ == "__main__":
    with open("data/token_audit.json", "r") as f:
        return_token_usage(f)