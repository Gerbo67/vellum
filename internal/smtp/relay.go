package smtp

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	netmail "net/mail"
	netsmtp "net/smtp"
	"strings"
	"time"

	"github.com/loomtek/vellum/internal/domain"
)

const (
	base64LineLen = 76
	dialTimeout   = 15 * time.Second
)

// extractAddress returns the bare email address from a "Name <email>" field.
func extractAddress(addr string) string {
	parsed, err := netmail.ParseAddress(addr)
	if err != nil {
		return addr
	}
	return parsed.Address
}

func dialSMTP(host string, port int) (*netsmtp.Client, error) {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}
	c, err := netsmtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("smtp client: %w", err)
	}
	return c, nil
}

func setupAuth(c *netsmtp.Client, cfg *domain.SMTPRelayConfig) error {
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: cfg.Host}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	if cfg.Username != "" {
		auth := netsmtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	return nil
}

func doSend(c *netsmtp.Client, from string, to []string, msg []byte) error {
	if err := c.Mail(from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	for _, r := range to {
		if err := c.Rcpt(r); err != nil {
			return fmt.Errorf("smtp RCPT TO %s: %w", r, err)
		}
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	return w.Close()
}

func wrapBase64(s string) string {
	var buf bytes.Buffer
	for len(s) > 0 {
		n := len(s)
		if n > base64LineLen {
			n = base64LineLen
		}
		buf.WriteString(s[:n])
		buf.WriteString("\r\n")
		s = s[n:]
	}
	return buf.String()
}

func buildMIMEMessage(from string, to []string, subject, htmlBody, textBody string) []byte {
	var buf bytes.Buffer
	now := time.Now().Format("Mon, 02 Jan 2006 15:04:05 -0700")

	buf.WriteString("From: " + from + "\r\n")
	buf.WriteString("To: " + strings.Join(to, ", ") + "\r\n")
	buf.WriteString("Subject: =?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(subject)) + "?=\r\n")
	buf.WriteString("Date: " + now + "\r\n")
	buf.WriteString("MIME-Version: 1.0\r\n")

	boundary := fmt.Sprintf("vellum-%d", time.Now().UnixNano())

	if htmlBody != "" && textBody != "" {
		buf.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")

		buf.WriteString("--" + boundary + "\r\n")
		buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		buf.WriteString(wrapBase64(base64.StdEncoding.EncodeToString([]byte(textBody))))

		buf.WriteString("--" + boundary + "\r\n")
		buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		buf.WriteString(wrapBase64(base64.StdEncoding.EncodeToString([]byte(htmlBody))))

		buf.WriteString("--" + boundary + "--\r\n")
	} else if htmlBody != "" {
		buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		buf.WriteString(wrapBase64(base64.StdEncoding.EncodeToString([]byte(htmlBody))))
	} else {
		buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		buf.WriteString(wrapBase64(base64.StdEncoding.EncodeToString([]byte(textBody))))
	}

	return buf.Bytes()
}

// SendEmail delivers a captured email to the specified recipients through the
// configured SMTP relay. Returns an error if the relay is disabled or the
// from-address is not configured.
func SendEmail(cfg *domain.SMTPRelayConfig, email *domain.Email, to []string) error {
	if !cfg.Enabled {
		return fmt.Errorf("smtp relay no está habilitado")
	}
	if cfg.FromAddress == "" {
		return fmt.Errorf("la dirección de envío no está configurada en el relay SMTP")
	}

	envelopeFrom := extractAddress(cfg.FromAddress)
	msg := buildMIMEMessage(cfg.FromAddress, to, email.Subject, email.HTMLBody, email.TextBody)

	if cfg.UseTLS {
		addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: dialTimeout}, "tcp", addr, &tls.Config{ServerName: cfg.Host})
		if err != nil {
			return fmt.Errorf("tls dial: %w", err)
		}
		c, err := netsmtp.NewClient(conn, cfg.Host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Close()
		if cfg.Username != "" {
			auth := netsmtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
			if err := c.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth: %w", err)
			}
		}
		return doSend(c, envelopeFrom, to, msg)
	}

	c, err := dialSMTP(cfg.Host, cfg.Port)
	if err != nil {
		return err
	}
	defer c.Close()
	if err := setupAuth(c, cfg); err != nil {
		return err
	}
	return doSend(c, envelopeFrom, to, msg)
}

// TestConnection verifies connectivity and authentication against the configured
// SMTP relay without sending a message (NOOP command).
func TestConnection(cfg *domain.SMTPRelayConfig) error {
	if cfg.UseTLS {
		addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: dialTimeout}, "tcp", addr, &tls.Config{ServerName: cfg.Host})
		if err != nil {
			return fmt.Errorf("tls dial: %w", err)
		}
		c, err := netsmtp.NewClient(conn, cfg.Host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Close()
		if cfg.Username != "" {
			auth := netsmtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
			if err := c.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth: %w", err)
			}
		}
		return c.Noop()
	}

	c, err := dialSMTP(cfg.Host, cfg.Port)
	if err != nil {
		return err
	}
	defer c.Close()
	if err := setupAuth(c, cfg); err != nil {
		return err
	}
	return c.Noop()
}
