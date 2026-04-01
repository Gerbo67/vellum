package server

import (
	"io"
	"net/http"

	"github.com/loomtek/vellum/internal/analysis"
	"github.com/loomtek/vellum/internal/domain"
)

// handleAnalyzeHTML accepts a multipart HTML file upload (max 5 MB), wraps it in
// a minimal Email struct, and returns the analysis result.
func (s *Server) handleAnalyzeHTML(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		jsonError(w, "archivo demasiado grande (máx 5 MB)", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("html")
	if err != nil {
		jsonError(w, "se requiere el archivo HTML", http.StatusBadRequest)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(io.LimitReader(file, 5<<20))
	if err != nil {
		jsonError(w, "error al leer el archivo", http.StatusInternalServerError)
		return
	}

	e := &domain.Email{
		HTMLBody: string(content),
	}

	lang := r.URL.Query().Get("lang")
	jsonOK(w, analysis.Analyze(e, lang))
}
