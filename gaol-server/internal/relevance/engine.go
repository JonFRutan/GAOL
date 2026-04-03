// Package relevance implements keyword-based lore filtering.
// Ported from the Python RelevanceEngine class.
package relevance

import (
	"regexp"
	"strings"

	"github.com/JonFRutan/gaol-server/internal/models"
)

// Common stop words to filter out of search context.
var stopWords = map[string]bool{
	"the": true, "is": true, "at": true, "which": true, "on": true,
	"a": true, "an": true, "and": true, "or": true, "but": true,
	"if": true, "of": true, "to": true, "in": true, "for": true,
	"with": true, "by": true, "from": true, "up": true, "about": true,
	"into": true, "over": true, "after": true, "i": true, "you": true,
	"he": true, "she": true, "it": true, "we": true, "they": true,
	"me": true, "him": true, "her": true, "us": true, "them": true,
	"my": true, "your": true, "his": true, "its": true, "our": true, "their": true,
}

var wordRe = regexp.MustCompile(`\b\w+\b`)

// ExtractKeywords tokenises text and removes stop words.
func ExtractKeywords(text string) map[string]bool {
	kw := make(map[string]bool)
	tokens := wordRe.FindAllString(strings.ToLower(text), -1)
	for _, t := range tokens {
		if !stopWords[t] {
			kw[t] = true
		}
	}
	return kw
}

type scoredItem struct {
	text  string
	score float64
}

// GetRelevantLore scores world entities against the current context
// and returns the top `limit` items as a formatted block.
func GetRelevantLore(world *models.World, historyBuffer, currentActions string, limit int) string {
	searchContext := historyBuffer + " " + currentActions
	contextKW := ExtractKeywords(searchContext)

	var items []scoredItem

	// Score groups/factions
	for _, group := range world.Groups {
		score := 0.0
		groupWords := ExtractKeywords(group.Name)
		score += float64(intersectionSize(groupWords, contextKW)) * 2.0

		if len(group.Keywords) > 0 {
			kwSet := make(map[string]bool)
			for _, k := range group.Keywords {
				kwSet[strings.ToLower(k)] = true
			}
			score += float64(intersectionSize(kwSet, contextKW))
		}

		descWords := ExtractKeywords(group.Description)
		score += float64(intersectionSize(descWords, contextKW)) * 0.5

		if score > 0 {
			items = append(items, scoredItem{
				text:  "[" + group.TypeTag + "] " + group.Name + ": " + group.Description,
				score: score,
			})
		}
	}

	// Score locations
	for _, loc := range world.Locations {
		score := 0.0
		locWords := ExtractKeywords(loc.Name)
		score += float64(intersectionSize(locWords, contextKW)) * 2.0

		if len(loc.Keywords) > 0 {
			kwSet := make(map[string]bool)
			for _, k := range loc.Keywords {
				kwSet[strings.ToLower(k)] = true
			}
			score += float64(intersectionSize(kwSet, contextKW))
		}

		if score > 0 {
			items = append(items, scoredItem{
				text:  "[" + loc.TypeTag + "] " + loc.Name + ": " + loc.Description + " [Controlled by: " + loc.Affiliation + "]",
				score: score,
			})
		}
	}

	// Score characters
	for _, ch := range world.Characters {
		score := 0.0
		chWords := ExtractKeywords(ch.Name)
		score += float64(intersectionSize(chWords, contextKW)) * 2.0

		if len(ch.Keywords) > 0 {
			kwSet := make(map[string]bool)
			for _, k := range ch.Keywords {
				kwSet[strings.ToLower(k)] = true
			}
			score += float64(intersectionSize(kwSet, contextKW))
		}

		descWords := ExtractKeywords(ch.Description)
		score += float64(intersectionSize(descWords, contextKW)) * 0.5

		if score > 0 {
			items = append(items, scoredItem{
				text:  "[Character] " + ch.Name + " (" + ch.Role + "): " + ch.Description + " [Status: " + ch.Status + "]",
				score: score,
			})
		}
	}

	// Score biology
	for _, bio := range world.Biology {
		score := 0.0
		bioWords := ExtractKeywords(bio.Name)
		score += float64(intersectionSize(bioWords, contextKW)) * 2.0

		descWords := ExtractKeywords(bio.Description)
		score += float64(intersectionSize(descWords, contextKW)) * 0.5

		if score > 0 {
			items = append(items, scoredItem{
				text:  "[Biology] " + bio.Name + ": " + bio.Description + " [Habitat: " + bio.Habitat + ", " + bio.Disposition + "]",
				score: score,
			})
		}
	}

	// Score major events (with recency bias)
	totalEvents := len(world.MajorEvents)
	for i, evt := range world.MajorEvents {
		score := 0.0
		textContent := evt.Title + " " + evt.Description
		eventWords := ExtractKeywords(textContent)
		score += float64(intersectionSize(eventWords, contextKW))

		// Recency bias
		if totalEvents > 0 {
			score += (float64(i) / float64(totalEvents)) * 2.0
		}

		// Most recent event always included
		if i == totalEvents-1 {
			score += 10.0
		}

		items = append(items, scoredItem{
			text:  "[History] " + evt.Title + ": " + evt.Description,
			score: score,
		})
	}

	// Sort by score descending (simple selection sort — small N)
	for i := 0; i < len(items); i++ {
		maxIdx := i
		for j := i + 1; j < len(items); j++ {
			if items[j].score > items[maxIdx].score {
				maxIdx = j
			}
		}
		items[i], items[maxIdx] = items[maxIdx], items[i]
	}

	// Take top N
	if limit > len(items) {
		limit = len(items)
	}
	var lines []string
	for _, it := range items[:limit] {
		lines = append(lines, it.text)
	}

	if len(lines) == 0 {
		return "No known history."
	}
	return strings.Join(lines, "\n")
}

func intersectionSize(a, b map[string]bool) int {
	count := 0
	for k := range a {
		if b[k] {
			count++
		}
	}
	return count
}