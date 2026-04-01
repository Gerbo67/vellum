package smtp

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/emersion/go-message/mail"
	"github.com/emersion/go-sasl"
	gosmtp "github.com/emersion/go-smtp"
	"github.com/google/uuid"
	"github.com/loomtek/vellum/internal/domain"
	vlog "github.com/loomtek/vellum/internal/logger"
	"github.com/loomtek/vellum/internal/storage"
)

// Notifier is implemented by any component that needs to be informed when a
// new email is captured by the SMTP server.
type Notifier interface {
	Notify(e *domain.Email)
}

type backend struct {
	db       *storage.DB
	notifier Notifier
}

type session struct {
	db        *storage.DB
	notifier  Notifier
	from      string
	to        []string
	projectID string
}

func (b *backend) NewSession(_ *gosmtp.Conn) (gosmtp.Session, error) {
	return &session{db: b.db, notifier: b.notifier}, nil
}

func (s *session) AuthMechanisms() []string {
	return []string{"PLAIN", "LOGIN"}
}

func (s *session) Auth(_ string) (sasl.Server, error) {
	return sasl.NewPlainServer(func(_, _, _ string) error {
		return nil
	}), nil
}

// Mail validates the sender address against registered project senders. If no
// match is found, the message is rejected with SMTP 550.
func (s *session) Mail(from string, _ *gosmtp.MailOptions) error {
	pid := s.matchProject(from)
	if pid == "" {
		vlog.Security("smtp_sender_rejected",
			"from", from,
		)
		return &gosmtp.SMTPError{
			Code:         550,
			EnhancedCode: gosmtp.EnhancedCode{5, 1, 0},
			Message:      "Sender address rejected: not registered in any project",
		}
	}
	s.from = from
	s.projectID = pid
	return nil
}

func (s *session) Rcpt(to string, _ *gosmtp.RcptOptions) error {
	s.to = append(s.to, to)
	return nil
}

// Data reads the message body, parses headers, extracts attachments, enforces
// the project storage quota, persists the email, and triggers a notification.
func (s *session) Data(r io.Reader) error {
	raw, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}

	e := &domain.Email{
		ID:          uuid.NewString(),
		From:        s.from,
		To:          append([]string{}, s.to...),
		CC:          []string{},
		Subject:     "(no subject)",
		ReceivedAt:  time.Now(),
		Size:        int64(len(raw)),
		Attachments: []domain.Attachment{},
		ReadBy:      []string{},
	}

	mr, parseErr := mail.CreateReader(bytes.NewReader(raw))
	if parseErr == nil {
		h := mr.Header
		if subject, err := h.Subject(); err == nil {
			e.Subject = subject
		}
		if msgID, err := h.MessageID(); err == nil {
			e.MessageID = msgID
		}
		if cc, err := h.AddressList("Cc"); err == nil {
			for _, a := range cc {
				e.CC = append(e.CC, a.Address)
			}
		}
		if from, err := h.AddressList("From"); err == nil && len(from) > 0 {
			if from[0].Name != "" {
				e.From = from[0].Name + " <" + from[0].Address + ">"
			} else {
				e.From = from[0].Address
			}
		}

		e.RawHeaders = make(map[string][]string)
		fields := h.Fields()
		for fields.Next() {
			k := strings.ToLower(fields.Key())
			e.RawHeaders[k] = append(e.RawHeaders[k], fields.Value())
		}

		s.parseParts(mr, e)
	} else {
		e.TextBody = string(raw)
	}

	e.ProjectID = s.projectID

	if proj, err := s.db.GetProject(s.projectID); err == nil && proj.StorageLimit > 0 {
		if used, err := s.db.GetProjectStorageUsage(s.projectID); err == nil {
			if used+e.Size > proj.StorageLimit {
				return &gosmtp.SMTPError{
					Code:         552,
					EnhancedCode: gosmtp.EnhancedCode{5, 2, 2},
					Message:      "Insufficient storage: project quota exceeded",
				}
			}
		}
	}

	if err := s.db.SaveEmail(e); err != nil {
		slog.Error("smtp save email failed", "error", err.Error(), "from", e.From)
		return err
	}

	slog.Info("smtp email received",
		"from", e.From,
		"subject", e.Subject,
		"project", e.ProjectID,
		"size_bytes", e.Size,
	)

	if s.notifier != nil {
		go s.notifier.Notify(e)
	}

	return nil
}

func (s *session) parseParts(mr *mail.Reader, e *domain.Email) {
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}

		switch h := p.Header.(type) {
		case *mail.InlineHeader:
			ct, _, _ := h.ContentType()
			body, _ := io.ReadAll(p.Body)
			switch {
			case strings.HasPrefix(ct, "text/html"):
				e.HTMLBody = string(body)
			case strings.HasPrefix(ct, "text/plain"):
				e.TextBody = string(body)
			}
		case *mail.AttachmentHeader:
			ct, _, _ := h.ContentType()
			filename, _ := h.Filename()
			body, _ := io.ReadAll(p.Body)
			e.Attachments = append(e.Attachments, domain.Attachment{
				ID:          uuid.NewString(),
				Filename:    filename,
				ContentType: ct,
				Size:        int64(len(body)),
				Data:        body,
			})
		}
	}
}

func (s *session) matchProject(from string) string {
	projects, err := s.db.ListProjects()
	if err != nil {
		return ""
	}
	from = strings.ToLower(strings.TrimSpace(from))
	for _, p := range projects {
		if !p.Active {
			continue
		}
		for _, sender := range p.Senders {
			if strings.ToLower(strings.TrimSpace(sender)) == from {
				return p.ID
			}
		}
	}
	return ""
}

func (s *session) Reset() {
	s.from = ""
	s.to = nil
	s.projectID = ""
}

func (s *session) Logout() error {
	return nil
}

// NewServer creates and configures the SMTP capture server bound to addr.
func NewServer(addr string, db *storage.DB, maxSize int64, notifier Notifier) *gosmtp.Server {
	srv := gosmtp.NewServer(&backend{db: db, notifier: notifier})
	srv.Addr = addr
	srv.Domain = "vellum.local"
	srv.MaxMessageBytes = maxSize
	srv.MaxRecipients = 50
	srv.AllowInsecureAuth = true
	return srv
}
