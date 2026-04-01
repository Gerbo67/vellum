package analysis

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"unicode"
)

const (
	classHam      = 0
	classSpam     = 1
	spamThreshold = 0.75
	maxTriggers   = 5
	minTokenLen   = 3
)

// spamModel holds the trained Naive Bayes parameters used by the spam classifier.
type spamModel struct {
	ClassDocCounts [2]int64            `json:"class_doc_counts"`
	WordCounts     [2]map[string]int64 `json:"word_counts"`
	VocabSize      int64               `json:"vocab_size"`
}

var activeSpamModel *spamModel

// LoadSpamModel initialises the global classifier from raw JSON bytes containing
// the serialised Naive Bayes model.
func LoadSpamModel(data []byte) error {
	var m spamModel
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	if m.WordCounts[classHam] == nil {
		m.WordCounts[classHam] = make(map[string]int64)
	}
	if m.WordCounts[classSpam] == nil {
		m.WordCounts[classSpam] = make(map[string]int64)
	}
	activeSpamModel = &m
	return nil
}

// tokenizeText splits text into cleaned lowercase tokens of at least minTokenLen chars.
func tokenizeText(text string) []string {
	var tokens []string
	var buf strings.Builder
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			buf.WriteRune(r)
		} else {
			if buf.Len() >= minTokenLen {
				tokens = append(tokens, buf.String())
			}
			buf.Reset()
		}
	}
	if buf.Len() >= minTokenLen {
		tokens = append(tokens, buf.String())
	}
	return tokens
}

func (m *spamModel) classWordTotal(class int) int64 {
	var total int64
	for _, c := range m.WordCounts[class] {
		total += c
	}
	return total
}

func (m *spamModel) logWordProb(word string, class int) float64 {
	count := m.WordCounts[class][word]
	total := m.classWordTotal(class)
	return math.Log(float64(count+1) / float64(total+m.VocabSize))
}

// AnalyzeSpamProbability classifies text as spam or ham using the loaded Naive
// Bayes model. Returns whether the text is spam, a probability in [0,1], and
// the top contributing tokens. If no model is loaded it returns (false, 0, nil).
func AnalyzeSpamProbability(text string) (isSpam bool, probability float64, triggers []string) {
	if activeSpamModel == nil {
		return false, 0, nil
	}

	tokens := tokenizeText(text)
	if len(tokens) == 0 {
		return false, 0, nil
	}

	total := activeSpamModel.ClassDocCounts[classHam] + activeSpamModel.ClassDocCounts[classSpam]
	if total == 0 {
		return false, 0, nil
	}

	logPriorHam := math.Log(float64(activeSpamModel.ClassDocCounts[classHam]+1) / float64(total+2))
	logPriorSpam := math.Log(float64(activeSpamModel.ClassDocCounts[classSpam]+1) / float64(total+2))

	scoreHam := logPriorHam
	scoreSpam := logPriorSpam

	type tokenDelta struct {
		token string
		delta float64
	}
	var deltas []tokenDelta

	seen := map[string]bool{}
	for _, tok := range tokens {
		if seen[tok] {
			continue
		}
		seen[tok] = true
		lph := activeSpamModel.logWordProb(tok, classHam)
		lps := activeSpamModel.logWordProb(tok, classSpam)
		scoreHam += lph
		scoreSpam += lps
		if d := lps - lph; d > 0 {
			deltas = append(deltas, tokenDelta{tok, d})
		}
	}

	// Softmax to convert log-scores into a probability
	maxScore := math.Max(scoreHam, scoreSpam)
	expHam := math.Exp(scoreHam - maxScore)
	expSpam := math.Exp(scoreSpam - maxScore)
	pSpam := expSpam / (expHam + expSpam)

	isSpam = pSpam >= spamThreshold

	if isSpam {
		sort.Slice(deltas, func(i, j int) bool { return deltas[i].delta > deltas[j].delta })
		dedupe := map[string]bool{}
		for _, d := range deltas {
			if !dedupe[d.token] {
				dedupe[d.token] = true
				triggers = append(triggers, d.token)
				if len(triggers) == maxTriggers {
					break
				}
			}
		}
	}

	return isSpam, pSpam, triggers
}
