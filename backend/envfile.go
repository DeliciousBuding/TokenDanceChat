package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"
)

// loadEnvFiles loads environment variables from .env.local then .env. The
// backend is commonly started from backend/ (`cd backend && go run .`) while
// env files live at the repo root, so each name is probed in the current
// working directory first, then its parent. Missing files are skipped.
// Existing OS environment variables always win — files only fill gaps.
func loadEnvFiles() {
	seen := map[string]bool{}
	for _, name := range []string{".env.local", ".env"} {
		for _, dir := range []string{".", ".."} {
			path := filepath.Join(dir, name)
			abs, err := filepath.Abs(path)
			if err == nil {
				if seen[abs] {
					continue
				}
				seen[abs] = true
			}
			ok, err := loadEnvFile(path)
			if err != nil {
				log.Printf("warn: failed to load env file %s: %v", path, err)
				continue
			}
			if ok {
				log.Printf("loaded env file %s", path)
			}
		}
	}
}

// loadEnvFile parses KEY=VALUE lines from path into the process environment,
// without overriding variables that already exist in the OS environment.
// Returns true if the file was found and parsed. Values may be wrapped in
// matching single or double quotes, which are stripped.
func loadEnvFile(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		// Skip blank lines and comments.
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		value = strings.TrimSpace(value)
		// Strip matching surrounding quotes.
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		// OS env wins; file only fills gaps.
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		os.Setenv(key, value)
	}
	return true, nil
}
