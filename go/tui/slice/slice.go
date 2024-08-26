package slice

// HasString returns true if the slice has the string.
func HasString(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
