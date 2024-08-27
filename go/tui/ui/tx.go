package ui

import tea "github.com/charmbracelet/bubbletea"

type txMsg bool

func tx() tea.Msg {
	return txMsg(true)
}
