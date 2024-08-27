package ui

import (
	"errors"
	"fmt"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type addResourceGraphState int

const (
	ADD_RESOURCE_GRAPH_ENTRY_LIST addResourceGraphState = iota
	ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT
	ADD_RESOURCE_GRAPH_API_LIST
	ADD_RESOURCE_GRAPH_DB_LIST
)

type addResourceGraphType struct {
	state            addResourceGraphState
	entryList        ListModel
	entryEntityInput textinput.Model
	apiList          ListModel
	dbList           ListModel
}

var addResourceGraphStates = newRegister[model]()

func addResourceGraphUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := addResourceGraphStates.Fns[int(m.addResourceGraph.state)]
	if !ok {
		s := fmt.Sprintf("Unknown add resource graph state: %d\n\n", m.addResourceGraph.state)
		return m, tea.Sequence(tx, tea.Println(s))
	}
	return stateFn.Update(m, msg)
}

func addResourceGraphEntryListUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		m.addResourceGraph.entryList.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.addResourceGraph.state = ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT
			return m, tea.Sequence(tx, m.addResourceGraph.entryEntityInput.Focus())
		}
	}

	var cmd tea.Cmd
	m.addResourceGraph.entryList, cmd = m.addResourceGraph.entryList.Update(msg)
	return m, cmd
}

func addResourceGraphEntryEntityInputUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if m.addResourceGraph.entryEntityInput.Value() == "" {
				m.addResourceGraph.entryEntityInput.Err = &inputErr{
					Msg: "Entity is required",
				}
				return m, nil
			}
			m.addResourceGraph.state = ADD_RESOURCE_GRAPH_API_LIST
			return m, tx
		}
	}

	var cmd tea.Cmd
	m.addResourceGraph.entryEntityInput, cmd = m.addResourceGraph.entryEntityInput.Update(msg)
	return m, cmd
}

func addResourceGraphApiListUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		m.addResourceGraph.apiList.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.addResourceGraph.state = ADD_RESOURCE_GRAPH_DB_LIST
			return m, tx
		}
	}

	var cmd tea.Cmd
	m.addResourceGraph.apiList, cmd = m.addResourceGraph.apiList.Update(msg)
	return m, cmd
}

func addResourceGraphDbListUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg.(type) {
	case txMsg:
		m.addResourceGraph.dbList.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	}

	var cmd tea.Cmd
	m.addResourceGraph.dbList, cmd = m.addResourceGraph.dbList.Update(msg)
	return m, cmd
}

func addResourceGraphView(m model) string {
	stateFn, ok := addResourceGraphStates.Fns[int(m.addResourceGraph.state)]
	if !ok {
		s := fmt.Sprintf("Unknown add resource graph state: %d\n\n", m.addResourceGraph.state)
		return s
	}
	return stateFn.View(m)
}

func addResourceGraphEntryListView(m model) string {
	return m.addResourceGraph.entryList.View()
}

func addResourceGraphEntryEntityInputView(m model) string {
	s := lipgloss.JoinVertical(
		lipgloss.Top,
		string(m.addResourceGraph.entryList.SelectedItemId()),
		"Resource entity group pre-set to web",
		"Enter resource entity:",
		m.addResourceGraph.entryEntityInput.View(),
	)
	if m.addResourceGraph.entryEntityInput.Err != nil {
		var inputErr *inputErr
		switch {
		case errors.As(m.addResourceGraph.entryEntityInput.Err, &inputErr):
			s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.addResourceGraph.entryEntityInput.Err)))
		default:
			s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.addResourceGraph.entryEntityInput.Err)))
		}
	}
	return s
}

func addResourceGraphApiListView(m model) string {
	return m.addResourceGraph.apiList.View()
}

func addResourceGraphDbListView(m model) string {
	return m.addResourceGraph.dbList.View()
}
