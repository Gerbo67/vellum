package storage

import (
	"encoding/json"
	"fmt"

	"github.com/loomtek/vellum/internal/domain"
	bolt "go.etcd.io/bbolt"
)

// ---- ProviderIdentity ----

// CreateProviderIdentity stores a new provider identity and maintains secondary
// indexes by provider+providerID and by userID+provider.
func (d *DB) CreateProviderIdentity(pi *domain.ProviderIdentity) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketProviderIdentities)
		bByProvider := tx.Bucket(bucketIdentityByProvider)
		bByUser := tx.Bucket(bucketIdentitiesByUser)

		providerKey := providerIdentityKey(pi.Provider, pi.ProviderID)
		if existing := bByProvider.Get(providerKey); existing != nil {
			return ErrConflict
		}

		data, err := json.Marshal(pi)
		if err != nil {
			return err
		}
		if err := bMain.Put([]byte(pi.ID), data); err != nil {
			return err
		}
		if err := bByProvider.Put(providerKey, []byte(pi.ID)); err != nil {
			return err
		}
		userKey := userProviderKey(pi.UserID, pi.Provider)
		return bByUser.Put(userKey, []byte(pi.ID))
	})
}

// GetProviderIdentityByProviderID looks up an identity by provider name and the
// external identifier returned by that provider.
func (d *DB) GetProviderIdentityByProviderID(provider domain.ProviderName, providerID string) (*domain.ProviderIdentity, error) {
	var pi domain.ProviderIdentity
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByProvider := tx.Bucket(bucketIdentityByProvider)
		idBytes := bByProvider.Get(providerKey(provider, providerID))
		if idBytes == nil {
			return ErrNotFound
		}
		bMain := tx.Bucket(bucketProviderIdentities)
		v := bMain.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &pi)
	})
	if err != nil {
		return nil, err
	}
	return &pi, nil
}

// GetProviderIdentitiesByUser returns all provider identities linked to a user.
func (d *DB) GetProviderIdentitiesByUser(userID string) ([]domain.ProviderIdentity, error) {
	var ids []string
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByUser := tx.Bucket(bucketIdentitiesByUser)
		prefix := []byte(userID + ":")
		c := bByUser.Cursor()
		for k, v := c.Seek(prefix); k != nil && len(k) > len(prefix) && string(k[:len(prefix)]) == string(prefix); k, v = c.Next() {
			ids = append(ids, string(v))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	result := make([]domain.ProviderIdentity, 0, len(ids))
	err = d.bolt.View(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketProviderIdentities)
		for _, id := range ids {
			v := bMain.Get([]byte(id))
			if v == nil {
				continue
			}
			var pi domain.ProviderIdentity
			if err := json.Unmarshal(v, &pi); err != nil {
				return err
			}
			result = append(result, pi)
		}
		return nil
	})
	return result, err
}

// GetProviderIdentityByUserAndProvider returns the identity for a specific user+provider pair.
func (d *DB) GetProviderIdentityByUserAndProvider(userID string, provider domain.ProviderName) (*domain.ProviderIdentity, error) {
	var pi domain.ProviderIdentity
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByUser := tx.Bucket(bucketIdentitiesByUser)
		idBytes := bByUser.Get(userProviderKey(userID, provider))
		if idBytes == nil {
			return ErrNotFound
		}
		bMain := tx.Bucket(bucketProviderIdentities)
		v := bMain.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &pi)
	})
	if err != nil {
		return nil, err
	}
	return &pi, nil
}

// UpdateProviderIdentity persists changes to an existing ProviderIdentity (e.g. password rotation).
func (d *DB) UpdateProviderIdentity(pi *domain.ProviderIdentity) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketProviderIdentities)
		if bMain.Get([]byte(pi.ID)) == nil {
			return ErrNotFound
		}
		data, err := json.Marshal(pi)
		if err != nil {
			return err
		}
		return bMain.Put([]byte(pi.ID), data)
	})
}

// DeleteProviderIdentity removes a provider identity and its secondary indexes.
func (d *DB) DeleteProviderIdentity(pi *domain.ProviderIdentity) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketProviderIdentities)
		bByProvider := tx.Bucket(bucketIdentityByProvider)
		bByUser := tx.Bucket(bucketIdentitiesByUser)

		bMain.Delete([]byte(pi.ID))
		bByProvider.Delete(providerKey(pi.Provider, pi.ProviderID))
		bByUser.Delete(userProviderKey(pi.UserID, pi.Provider))
		return nil
	})
}

// ListProviderIdentitiesByProvider returns all identities registered under a
// given provider. Used to determine whether a provider has ever been used.
func (d *DB) ListProviderIdentitiesByProvider(provider domain.ProviderName) ([]domain.ProviderIdentity, error) {
	prefix := []byte(string(provider) + ":")
	var result []domain.ProviderIdentity
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByProvider := tx.Bucket(bucketIdentityByProvider)
		bMain := tx.Bucket(bucketProviderIdentities)
		c := bByProvider.Cursor()
		for k, v := c.Seek(prefix); k != nil && len(k) >= len(prefix) && string(k[:len(prefix)]) == string(prefix); k, v = c.Next() {
			raw := bMain.Get(v)
			if raw == nil {
				continue
			}
			var pi domain.ProviderIdentity
			if err := json.Unmarshal(raw, &pi); err != nil {
				return err
			}
			result = append(result, pi)
		}
		return nil
	})
	return result, err
}

// ---- AuthProviderConfig ----

// GetAuthProviderConfig retrieves the configuration for a specific provider.
func (d *DB) GetAuthProviderConfig(name domain.ProviderName) (*domain.AuthProviderConfig, error) {
	var cfg domain.AuthProviderConfig
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketAuthProviderConfigs)
		v := b.Get([]byte(name))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &cfg)
	})
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveAuthProviderConfig persists an auth provider configuration.
func (d *DB) SaveAuthProviderConfig(cfg *domain.AuthProviderConfig) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketAuthProviderConfigs)
		data, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		return b.Put([]byte(cfg.Name), data)
	})
}

// ListAuthProviderConfigs returns all stored provider configurations.
func (d *DB) ListAuthProviderConfigs() ([]domain.AuthProviderConfig, error) {
	var result []domain.AuthProviderConfig
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketAuthProviderConfigs)
		return b.ForEach(func(_, v []byte) error {
			var cfg domain.AuthProviderConfig
			if err := json.Unmarshal(v, &cfg); err != nil {
				return err
			}
			result = append(result, cfg)
			return nil
		})
	})
	return result, err
}

// ---- index key helpers ----

func providerKey(provider domain.ProviderName, providerID string) []byte {
	return []byte(fmt.Sprintf("%s:%s", provider, providerID))
}

// providerIdentityKey is an alias kept for internal use within this file.
func providerIdentityKey(provider domain.ProviderName, providerID string) []byte {
	return providerKey(provider, providerID)
}

func userProviderKey(userID string, provider domain.ProviderName) []byte {
	return []byte(fmt.Sprintf("%s:%s", userID, provider))
}
