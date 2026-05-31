package hubble

import "time"

// ForceNegativeCache injects negative-cache state directly for testing,
// bypassing the normal dial path.
func (m *Manager) ForceNegativeCache(at time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dialFailed = true
	m.dialFailedGen = m.generation
	m.dialFailedAt = at
}
