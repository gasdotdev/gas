package ui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

func homeUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "n":
			m.mode = NEW_PROJECT
			return m, tea.Sequence(tx, m.newProject.dirInput.Focus())
		case "r":
			m.mode = ADD_RESOURCE
			return m, tx
		}
	}
	return m, nil
}

func homeView(m model) string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Gas.dev", "[n] New project", "[r] Add resource")
	if m.resources != nil && m.resources.NameToConfig != nil {
		s += "\n\nExisting resources:"
		for name := range m.resources.NameToConfig {
			s += fmt.Sprintf("\n- %s", name)
		}
	} else {
		s += "\n\nNo resources found"
	}
	return s
}
