//go:build ignore

// Herramienta de entrenamiento del clasificador Naive Bayes de Vellum.
//
// Uso:
//
//	go run tools/train/main.go
//
// Lee los ejemplos de tools/train/data/spam.txt y ham.txt,
// entrena el modelo y lo escribe en internal/analysis/model/spam_model.dat.
// El modelo anterior se archiva en internal/analysis/model/history/.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

const (
	classHam  = 0
	classSpam = 1
	minLen    = 3
)

type model struct {
	ClassDocCounts [2]int64            `json:"class_doc_counts"`
	WordCounts     [2]map[string]int64 `json:"word_counts"`
	VocabSize      int64               `json:"vocab_size"`
}

func tokenize(text string) []string {
	var tokens []string
	var buf strings.Builder
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			buf.WriteRune(r)
		} else {
			if buf.Len() >= minLen {
				tokens = append(tokens, buf.String())
			}
			buf.Reset()
		}
	}
	if buf.Len() >= minLen {
		tokens = append(tokens, buf.String())
	}
	return tokens
}

func loadExamples(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines, sc.Err()
}

func train(spamExamples, hamExamples []string) *model {
	m := &model{
		WordCounts: [2]map[string]int64{
			make(map[string]int64),
			make(map[string]int64),
		},
	}

	process := func(examples []string, class int) {
		for _, ex := range examples {
			m.ClassDocCounts[class]++
			seen := map[string]bool{}
			for _, tok := range tokenize(ex) {
				if !seen[tok] {
					seen[tok] = true
					m.WordCounts[class][tok]++
				}
			}
		}
	}

	process(hamExamples, classHam)
	process(spamExamples, classSpam)

	// Vocabulario: unión de ambas clases
	vocab := map[string]bool{}
	for w := range m.WordCounts[classHam] {
		vocab[w] = true
	}
	for w := range m.WordCounts[classSpam] {
		vocab[w] = true
	}
	m.VocabSize = int64(len(vocab))

	return m
}

func archiveModel(modelPath, historyDir string) error {
	data, err := os.ReadFile(modelPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := os.MkdirAll(historyDir, 0o755); err != nil {
		return err
	}
	stamp := time.Now().Format("2006-01-02")
	dst := filepath.Join(historyDir, fmt.Sprintf("spam_model_%s.dat", stamp))
	return os.WriteFile(dst, data, 0o644)
}

func main() {
	root, err := findRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, "error: no se encontró la raíz del proyecto (go.mod):", err)
		os.Exit(1)
	}

	spamFile := filepath.Join(root, "tools", "train", "data", "spam.txt")
	hamFile := filepath.Join(root, "tools", "train", "data", "ham.txt")
	modelPath := filepath.Join(root, "internal", "analysis", "model", "spam_model.dat")
	historyDir := filepath.Join(root, "internal", "analysis", "model", "history")

	spamExamples, err := loadExamples(spamFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error leyendo spam.txt:", err)
		os.Exit(1)
	}
	hamExamples, err := loadExamples(hamFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error leyendo ham.txt:", err)
		os.Exit(1)
	}

	fmt.Printf("Entrenando con %d ejemplos spam y %d ham...\n", len(spamExamples), len(hamExamples))

	m := train(spamExamples, hamExamples)

	if err := archiveModel(modelPath, historyDir); err != nil {
		fmt.Fprintln(os.Stderr, "advertencia: no se pudo archivar el modelo anterior:", err)
	}

	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, "error serializando modelo:", err)
		os.Exit(1)
	}
	if err := os.WriteFile(modelPath, out, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "error escribiendo modelo:", err)
		os.Exit(1)
	}

	fmt.Printf("Modelo entrenado y guardado en %s\n", modelPath)
	fmt.Printf("  Vocabulario: %d tokens únicos\n", m.VocabSize)
	fmt.Printf("  Docs ham: %d  |  Docs spam: %d\n", m.ClassDocCounts[classHam], m.ClassDocCounts[classSpam])
	fmt.Printf("  Historial en: %s\n", historyDir)
}

// findRoot sube desde el directorio actual hasta encontrar go.mod.
func findRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("go.mod no encontrado")
		}
		dir = parent
	}
}

