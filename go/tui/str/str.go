package str

import "strings"

// LowerCaseKebab converts a string to lower case kebab case.
//
// Example:
//
//	LowerCaseKebab("Hello World") // "hello-world"
func LowerCaseKebab(s string) string {
	return strings.ToLower(strings.ReplaceAll(s, " ", "-"))
}
