package ui

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/gasdotdev/gas/tui/degit"
)

type addResourceState int

const (
	ADD_RESOURCE_LIST addResourceState = iota
	ADD_RESOURCE_ENTITY_INPUT
	ADD_RESOURCE_DOWNLOADING_TEMPLATE
	ADD_RESOURCE_ERR
	ADD_RESOURCE_INPUTS
)

type addResourceType struct {
	state       addResourceState
	list        ListModel
	entityInput textinput.Model
	inputsList  ListModel
}

var addResourceStates = newRegister[model]()

func addResourceUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := addResourceStates.Fns[int(m.addResource.state)]
	if !ok {
		s := fmt.Sprintf("Unknown add resource state: %d\n\n", m.addResource.state)
		return m, tea.Sequence(tx, tea.Println(s))
	}
	return stateFn.Update(m, msg)
}

func addResourceListUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		m.addResource.list.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.addResource.state = ADD_RESOURCE_ENTITY_INPUT
			return m, m.addResource.entityInput.Focus()
		}
	}

	var cmd tea.Cmd
	m.addResource.list, cmd = m.addResource.list.Update(msg)
	return m, cmd
}

func addResourceEntityInputUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	repoUrl := "https://github.com/gasdotdev/gas"
	repoBranch := "master"
	extractPath := filepath.Join(".", "gas", fmt.Sprintf("web-%s-pages", m.addResource.entityInput.Value()))
	repoTemplate := "templates/cloudflare-pages-remix"

	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.addResource.state = ADD_RESOURCE_DOWNLOADING_TEMPLATE
			entityGroup := "web"
			entity := m.addResource.entityInput.Value()
			descriptor := "pages"
			return m, setupNewResource(repoUrl, repoBranch, degit.Paths{
				Repo:    repoTemplate,
				Extract: extractPath,
			}, entityGroup, entity, descriptor)
		}
	}

	var cmd tea.Cmd
	m.addResource.entityInput, cmd = m.addResource.entityInput.Update(msg)
	return m, cmd
}

func addResourceDownloadingTemplateUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case setupNewResourceOk:
		m.addResource.state = ADD_RESOURCE_INPUTS
		m.addResource.inputsList.SetItems(
			[]list.Item{
				ListItem{Id: "cloudflare-worker-hono", Option: "Cloudflare Worker Hono"},
			},
		)
		return m, tx
	case setupNewResourceErr:
		m.addResource.state = ADD_RESOURCE_ERR
		errMsg := fmt.Sprintf("Error downloading template: %v", msg.err)
		return m, tea.Println(errMsg)
	}
	return m, nil
}

func addResourceInputsUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	return m, nil
}

type setupNewResourceOk bool

type setupNewResourceErr struct {
	err error
}

func setupNewResource(repoUrl, branch string, path degit.Paths, entityGroup string, entity string, descriptor string) tea.Cmd {
	return func() tea.Msg {
		err := degit.Run(repoUrl, branch, []degit.Paths{path})
		if err != nil {
			return setupNewResourceErr{err: err}
		}

		newFileName := fmt.Sprintf("index.%s.%s.%s.ts", entityGroup, entity, descriptor)
		err = os.Rename(filepath.Join(path.Extract, "src", "index.web.entity.pages.ts"), filepath.Join(path.Extract, newFileName))
		if err != nil {
			return setupNewResourceErr{err: err}
		}

		return setupNewResourceOk(true)
	}
}

func addResourceView(m model) string {
	stateFn, ok := addResourceStates.Fns[int(m.addResource.state)]
	if !ok {
		s := fmt.Sprintf("Unknown add resource state: %d\n\n", m.addResource.state)
		return s
	}
	return stateFn.View(m)
}

func addResourceListView(m model) string {
	return m.addResource.list.View()
}

func addResourceEntityInputView(m model) string {
	s := lipgloss.JoinVertical(
		lipgloss.Top,
		"Enter resource entity:",
		m.addResource.entityInput.View(),
	)
	if m.addResource.entityInput.Err != nil {
		var inputErr *inputErr
		switch {
		case errors.As(m.addResource.entityInput.Err, &inputErr):
			s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.addResource.entityInput.Err)))
		default:
			s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.addResource.entityInput.Err)))
		}
	}
	return s
}

func addResourceDownloadingTemplateView(m model) string {
	return "Downloading template..."
}

func addResourceErrView(m model) string {
	return "Error"
}

func addResourceInputsView(m model) string {
	return m.addResource.inputsList.View()
}
