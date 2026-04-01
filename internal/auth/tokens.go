package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/loomtek/vellum/internal/domain"
	vlog "github.com/loomtek/vellum/internal/logger"
	"github.com/loomtek/vellum/internal/storage"
)

const (
	accessTokenDuration  = 15 * time.Minute
	refreshTokenDuration = 7 * 24 * time.Hour
	maxSessionAge        = 7 * 24 * time.Hour
	// replayGracePeriod prevents false-positive replay detection caused by
	// concurrent refresh requests across browser tabs.
	replayGracePeriod = 30 * time.Second
)

// ErrTokenRecentlyRotated signals that the token was already rotated within
// the grace period. The client should retry without refreshing; the cookies
// have already been updated by the earlier rotation.
var ErrTokenRecentlyRotated = errors.New("token recently rotated")

// Claims extends jwt.RegisteredClaims with Vellum-specific fields for user
// identification and role-based access control.
type Claims struct {
	UserID string      `json:"sub"`
	Role   domain.Role `json:"role"`
	JTI    string      `json:"jti"`
	jwt.RegisteredClaims
}

// TokenManager handles JWT access token issuance and refresh token family
// lifecycle, including rotation and replay detection.
type TokenManager struct {
	db        *storage.DB
	jwtSecret []byte
}

// NewTokenManager creates a TokenManager backed by the given database and
// HMAC-SHA256 signing secret.
func NewTokenManager(db *storage.DB, jwtSecret string) *TokenManager {
	return &TokenManager{
		db:        db,
		jwtSecret: []byte(jwtSecret),
	}
}

// IssueTokens creates a new token family containing a signed access token and
// an initial refresh token. Returns the access JWT, the refresh token ID, and
// the family ID.
func (tm *TokenManager) IssueTokens(userID string, role domain.Role) (accessToken, refreshTokenID, familyID string, err error) {
	familyID = uuid.NewString()
	refreshTokenID = uuid.NewString()
	jti := uuid.NewString()

	now := time.Now()
	accessExpiry := now.Add(accessTokenDuration)
	refreshExpiry := now.Add(refreshTokenDuration)

	claims := Claims{
		UserID: userID,
		Role:   role,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(accessExpiry),
			ID:        jti,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err = token.SignedString(tm.jwtSecret)
	if err != nil {
		return "", "", "", fmt.Errorf("sign access token: %w", err)
	}

	family := &domain.TokenFamily{
		FamilyID:  familyID,
		UserID:    userID,
		CreatedAt: now,
		Tokens: []domain.TokenRecord{
			{
				TokenID:   refreshTokenID,
				IssuedAt:  now,
				ExpiresAt: refreshExpiry,
			},
		},
	}

	if err := tm.db.CreateFamily(family); err != nil {
		return "", "", "", fmt.Errorf("create family: %w", err)
	}

	return accessToken, refreshTokenID, familyID, nil
}

// RefreshTokens is deprecated; use RefreshTokensWithFamily instead.
func (tm *TokenManager) RefreshTokens(refreshTokenID string, remoteAddr string) (newAccess, newRefresh, newFamily string, err error) {
	// Find the family containing this token
	// We need to search through families - we store familyID separately
	// The refresh token ID IS the family lookup - we need to find which family contains it
	// For efficiency, we embed the familyID in the refresh token cookie separately

	return "", "", "", errors.New("use RefreshTokensWithFamily instead")
}

// RefreshTokensWithFamily validates the refresh token within its family, rotates
// to a new refresh token, and issues a fresh access JWT. It enforces absolute
// session expiry, replay detection with a grace period for concurrent tabs, and
// immediate family invalidation on late reuse (potential token theft).
func (tm *TokenManager) RefreshTokensWithFamily(familyID, refreshTokenID, remoteAddr string, userRole domain.Role) (newAccess, newRefresh, newFamilyID string, err error) {
	family, err := tm.db.GetFamily(familyID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			vlog.Security("refresh_unknown_family",
				"family", familyID,
				"ip", remoteAddr,
			)
			return "", "", "", errors.New("sesión inválida")
		}
		return "", "", "", fmt.Errorf("get family: %w", err)
	}

	if family.Invalidated {
		vlog.Security("refresh_invalidated_family",
			"family", familyID,
			"user", family.UserID,
			"ip", remoteAddr,
		)
		return "", "", "", errors.New("sesión invalidada por razones de seguridad")
	}

	// Absolute session expiry: 7 days since the family was created.
	if time.Since(family.CreatedAt) > maxSessionAge {
		family.Invalidated = true
		_ = tm.db.SaveFamily(family)
		vlog.Security("session_expired",
			"family", familyID,
			"user", family.UserID,
			"age_hours", int(time.Since(family.CreatedAt).Hours()),
		)
		return "", "", "", errors.New("sesión expirada, inicia sesión nuevamente")
	}

	var tokenRecord *domain.TokenRecord
	for i := range family.Tokens {
		if family.Tokens[i].TokenID == refreshTokenID {
			tokenRecord = &family.Tokens[i]
			break
		}
	}

	if tokenRecord == nil {
		vlog.Security("refresh_token_not_in_family",
			"family", familyID,
			"user", family.UserID,
			"ip", remoteAddr,
		)
		return "", "", "", errors.New("refresh token inválido")
	}

	if tokenRecord.UsedAt != nil {
		age := time.Since(*tokenRecord.UsedAt)
		if age < replayGracePeriod {
			// Likely concurrent refresh across tabs, not theft.
			// The client should retry; cookies already contain the new token.
			return "", "", "", ErrTokenRecentlyRotated
		}
		// Late reuse: potential token theft.
		family.Invalidated = true
		_ = tm.db.SaveFamily(family)
		vlog.Security("token_replay_detected",
			"family", familyID,
			"user", family.UserID,
			"ip", remoteAddr,
			"token_used_ago", age.Round(time.Second).String(),
		)
		return "", "", "", errors.New("violación de seguridad: sesión invalidada por reutilización de token")
	}

	if time.Now().After(tokenRecord.ExpiresAt) {
		return "", "", "", errors.New("refresh token expirado")
	}

	now := time.Now()
	tokenRecord.UsedAt = &now
	if err := tm.db.SaveFamily(family); err != nil {
		return "", "", "", fmt.Errorf("save family: %w", err)
	}

	jti := uuid.NewString()
	accessExpiry := now.Add(accessTokenDuration)

	claims := Claims{
		UserID: family.UserID,
		Role:   userRole,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   family.UserID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(accessExpiry),
			ID:        jti,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	newAccess, err = token.SignedString(tm.jwtSecret)
	if err != nil {
		return "", "", "", fmt.Errorf("sign access token: %w", err)
	}

	newRefreshID := uuid.NewString()
	newRecord := domain.TokenRecord{
		TokenID:   newRefreshID,
		IssuedAt:  now,
		ExpiresAt: now.Add(refreshTokenDuration),
	}
	family.Tokens = append(family.Tokens, newRecord)
	if err := tm.db.SaveFamily(family); err != nil {
		return "", "", "", fmt.Errorf("save family: %w", err)
	}

	return newAccess, newRefreshID, familyID, nil
}

// RevokeAllForUser invalidates every active token family belonging to a user.
// Called when the user is suspended or archived.
func (tm *TokenManager) RevokeAllForUser(userID string) {
	_ = tm.db.RevokeAllFamiliesForUser(userID)
}

// RevokeFamily marks the given token family as invalidated, preventing any
// further refresh operations within that session.
func (tm *TokenManager) RevokeFamily(familyID string) error {
	family, err := tm.db.GetFamily(familyID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil // Already gone
		}
		return err
	}
	family.Invalidated = true
	return tm.db.SaveFamily(family)
}

// ValidateAccessToken parses and validates the given JWT string, returning the
// embedded claims on success.
func (tm *TokenManager) ValidateAccessToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return tm.jwtSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}
