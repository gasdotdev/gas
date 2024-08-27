package ui

import "github.com/charmbracelet/lipgloss"

/*
inputErr is a custom error type for setting errors on bubbletea's
textinput.

textinput has a Validate property:
https://github.com/charmbracelet/bubbles/blob/64a67d167062e075d80a132afc0851fd1b2c6b89/textinput/textinput.go#L142

An example implementation can be seen here:
https://github.com/charmbracelet/bubbletea/blob/ab280576a5c4c8f8da4bf1cc97f3bde214cdef63/examples/credit-card-form/main.go#L106

However, it's easier to set errors directly in update funcs. It
makes the error control explicit to the reader.

So textinput's Model has an Err field of type error:
https://github.com/charmbracelet/bubbles/blob/64a67d167062e075d80a132afc0851fd1b2c6b89/textinput/textinput.go#L87

That means update funcs can set errors directly like this:

	m.dirPathInput.Err = &inputErr{
		Msg: "Directory path is required",
	}

And view funcs can set and display errors like this:

	if m.dirPathInput.Err != nil {
		var inputErr *inputErr
		switch {
		case errors.As(m.dirPathInput.Err, &inputErr):
			s += fmt.Sprintf("%v\n\n", m.dirPathInput.Err)
		default:
			s += fmt.Sprintf("Error: %v\n\n", m.dirPathInput.Err)
		}
	}

There's a good write-up on extending Go's error interface here:
https://earthly.dev/blog/golang-errors/
*/

type inputErr struct {
	Msg string
}

func (e *inputErr) Error() string {
	return e.Msg
}

var inputErrStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
