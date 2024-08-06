package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

func main() {
	p := tea.NewProgram(inititialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v", err)
		os.Exit(1)
	}
}

type mode int

const (
	HOME mode = iota
	ADD_RESOURCE_GRAPH
	NEW_PROJECT
)

type model struct {
	mode             mode
	terminalHeight   int
	terminalWidth    int
	addResourceGraph addResourceGraphType
	newProject       newProjectType
}

type resourceTemplateData struct {
	name    string
	isApi   bool
	isDb    bool
	isEntry bool
}

type resourceTemplateIdToDataType map[string]resourceTemplateData

var resourceTemplateIdToData = resourceTemplateIdToDataType{
	"cloudflare-pages-remix": {name: "Cloudflare Pages + Remix", isEntry: true},
	"cloudflare-worker-hono": {name: "Cloudflare Worker + Hono", isApi: true, isEntry: true},
	"cloudflare-d1":          {name: "Cloudflare D1", isDb: true},
}

func setAddResourceGraphEntryOrderedListItems() []list.Item {
	items := []list.Item{}

	keys := make([]string, 0, len(resourceTemplateIdToData))
	for id, data := range resourceTemplateIdToData {
		if data.isEntry {
			keys = append(keys, id)
		}
	}

	sort.Strings(keys)

	for _, id := range keys {
		items = append(items, addResourceGraphEntryListItemId(id))
	}

	return items
}

func setAddResourceGraphOrderedApiListItems() []list.Item {
	items := []list.Item{}

	keys := make([]string, 0, len(resourceTemplateIdToData))
	for id, data := range resourceTemplateIdToData {
		if data.isApi {
			keys = append(keys, id)
		}
	}

	sort.Strings(keys)

	for _, id := range keys {
		items = append(items, addResourceGraphApiListItemId(id))
	}

	return items
}

func setAddResourceGraphOrderedDbListItems() []list.Item {
	items := []list.Item{}

	keys := make([]string, 0, len(resourceTemplateIdToData))
	for id, data := range resourceTemplateIdToData {
		if data.isDb {
			keys = append(keys, id)
		}
	}

	sort.Strings(keys)

	for _, id := range keys {
		items = append(items, addResourceGraphDbListItemId(id))
	}

	return items
}

func inititialModel() model {
	addResourceGraphEntryList := newAddResourceGraphEntryListModel(
		setAddResourceGraphEntryOrderedListItems(),
		addResourceGraphEntryListDelegate{},
		0,
		0,
	)
	addResourceGraphEntryList.Title = "Select entry resource:"
	addResourceGraphEntryList.SetShowStatusBar(false)
	addResourceGraphEntryList.SetFilteringEnabled(false)
	addResourceGraphEntryList.Styles.Title = addResourceGraphEntryListTitleStyle
	addResourceGraphEntryList.Styles.TitleBar = addResourceGraphEntryListTitleBarStyle
	addResourceGraphEntryList.Styles.PaginationStyle = addResourceGraphEntryListPaginationStyle
	addResourceGraphEntryList.Styles.HelpStyle = addResourceGraphEntryListHelpStyle

	addResourceGraphEntryEntityInput := textinput.New()
	addResourceGraphEntryEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceGraphApiList := newAddResourceGraphApiListModel(
		setAddResourceGraphOrderedApiListItems(),
		addResourceGraphApiListDelegate{},
		0,
		0,
	)
	addResourceGraphApiList.Title = "Select api resource:"
	addResourceGraphApiList.SetShowStatusBar(false)
	addResourceGraphApiList.SetFilteringEnabled(false)
	addResourceGraphApiList.Styles.Title = addResourceGraphApiListTitleStyle
	addResourceGraphApiList.Styles.TitleBar = addResourceGraphApiListTitleBarStyle
	addResourceGraphApiList.Styles.PaginationStyle = addResourceGraphApiListPaginationStyle
	addResourceGraphApiList.Styles.HelpStyle = addResourceGraphApiListHelpStyle

	addResourceGraphDbList := newAddResourceGraphDbListModel(
		setAddResourceGraphOrderedDbListItems(),
		addResourceGraphDbListDelegate{},
		0,
		0,
	)
	addResourceGraphDbList.Title = "Select db resource:"
	addResourceGraphDbList.SetShowStatusBar(false)
	addResourceGraphDbList.SetFilteringEnabled(false)
	addResourceGraphDbList.Styles.Title = addResourceGraphDbListTitleStyle
	addResourceGraphDbList.Styles.TitleBar = addResourceGraphDbListTitleBarStyle
	addResourceGraphDbList.Styles.PaginationStyle = addResourceGraphDbListPaginationStyle
	addResourceGraphDbList.Styles.HelpStyle = addResourceGraphDbListHelpStyle

	newProjectDirInput := textinput.New()
	newProjectDirInput.Placeholder = "./your-project-dir"

	return model{
		mode: HOME,
		addResourceGraph: addResourceGraphType{
			entryList:        addResourceGraphEntryList,
			entryEntityInput: addResourceGraphEntryEntityInput,
			apiList:          addResourceGraphApiList,
			dbList:           addResourceGraphDbList,
		},
		newProject: newProjectType{
			dirInput: newProjectDirInput,
		},
	}
}

type txMsg bool

func tx() tea.Msg {
	return txMsg(true)
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.terminalHeight = msg.Height
		m.terminalWidth = msg.Width
		return m, tx
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			return m, tea.Quit
		}
	}

	if m.mode == HOME {
		return homeUpdate(m, msg)
	} else if m.mode == ADD_RESOURCE_GRAPH {
		return addResourceGraphUpdate(m, msg)
	} else if m.mode == NEW_PROJECT {
		return newProjectUpdate(m, msg)
	} else {
		return m, nil
	}
}

func (m model) View() string {
	if m.mode == HOME {
		return homeView()
	} else if m.mode == ADD_RESOURCE_GRAPH {
		return addResourceGraphView(m)
	} else if m.mode == NEW_PROJECT {
		return newProjectView(m)
	} else {
		return fmt.Sprintf("Unknown mode: %d", m.mode)
	}
}

func homeUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "g":
			m.mode = ADD_RESOURCE_GRAPH
			return m, tx
		case "n":
			m.mode = NEW_PROJECT
			return m, tea.Sequence(tx, m.newProject.dirInput.Focus())
		}
	}
	return m, nil
}

func homeView() string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Gas.dev", "[g] Add resource graph", "[n] New project")
	return s
}

type addResourceGraphState int

const (
	ADD_RESOURCE_GRAPH_ENTRY_LIST_STATE addResourceGraphState = iota
	ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT_STATE
	ADD_RESOURCE_GRAPH_API_LIST_STATE
	ADD_RESOURCE_GRAPH_DB_LIST_STATE
)

type addResourceGraphType struct {
	state            addResourceGraphState
	entryList        addResourceGraphEntryListModel
	entryEntityInput textinput.Model
	apiList          addResourceGraphApiListModel
	dbList           addResourceGraphDbListModel
}

type InputErr struct {
	Msg string
}

func (e *InputErr) Error() string {
	return e.Msg
}

func addResourceGraphUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_ENTRY_LIST_STATE {
		switch msg := msg.(type) {
		case txMsg:
			m.addResourceGraph.entryList.SetSize(m.terminalWidth, m.terminalHeight)
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				m.addResourceGraph.state = ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT_STATE
				return m, tea.Sequence(tx, m.addResourceGraph.entryEntityInput.Focus())
			}
		}

		var cmd tea.Cmd
		m.addResourceGraph.entryList, cmd = m.addResourceGraph.entryList.Update(msg)
		return m, cmd
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT_STATE {
		switch msg := msg.(type) {
		case txMsg:
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				if m.addResourceGraph.entryEntityInput.Value() == "" {
					m.addResourceGraph.entryEntityInput.Err = &InputErr{
						Msg: "Entity is required",
					}
					return m, nil
				}
				m.addResourceGraph.state = ADD_RESOURCE_GRAPH_API_LIST_STATE
				return m, tx
			}
		}

		var cmd tea.Cmd
		m.addResourceGraph.entryEntityInput, cmd = m.addResourceGraph.entryEntityInput.Update(msg)
		return m, cmd
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_API_LIST_STATE {
		switch msg := msg.(type) {
		case txMsg:
			m.addResourceGraph.apiList.SetSize(m.terminalWidth, m.terminalHeight)
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				m.addResourceGraph.state = ADD_RESOURCE_GRAPH_DB_LIST_STATE
				return m, tx
			}
		}

		var cmd tea.Cmd
		m.addResourceGraph.apiList, cmd = m.addResourceGraph.apiList.Update(msg)
		return m, cmd
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_DB_LIST_STATE {
		switch msg.(type) {
		case txMsg:
			m.addResourceGraph.dbList.SetSize(m.terminalWidth, m.terminalHeight)
			return m, tea.ClearScreen
		}

		var cmd tea.Cmd
		m.addResourceGraph.dbList, cmd = m.addResourceGraph.dbList.Update(msg)
		return m, cmd
	}

	return m, nil
}

var inputErrStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))

func addResourceGraphView(m model) string {
	if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_ENTRY_LIST_STATE {
		return m.addResourceGraph.entryList.View()
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT_STATE {
		s := lipgloss.JoinVertical(
			lipgloss.Top,
			string(m.addResourceGraph.entryList.SelectedItemId()),
			"Resource entity group pre-set to web",
			"Enter resource entity:",
			m.addResourceGraph.entryEntityInput.View(),
		)
		if m.addResourceGraph.entryEntityInput.Err != nil {
			var inputErr *InputErr
			switch {
			case errors.As(m.addResourceGraph.entryEntityInput.Err, &inputErr):
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.addResourceGraph.entryEntityInput.Err)))
			default:
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.addResourceGraph.entryEntityInput.Err)))
			}
		}
		return s
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_API_LIST_STATE {
		return m.addResourceGraph.apiList.View()
	} else if m.addResourceGraph.state == ADD_RESOURCE_GRAPH_DB_LIST_STATE {
		return m.addResourceGraph.dbList.View()
	}
	return "Unknown add resource graph state"
}

var (
	addResourceGraphEntryListTitleBarStyle     = lipgloss.NewStyle()
	addResourceGraphEntryListTitleStyle        = lipgloss.NewStyle()
	addResourceGraphEntryListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	addResourceGraphEntryListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	addResourceGraphEntryListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	addResourceGraphEntryListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type addResourceGraphEntryListModel struct {
	list.Model
}

func newAddResourceGraphEntryListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) addResourceGraphEntryListModel {
	return addResourceGraphEntryListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l addResourceGraphEntryListModel) init() tea.Cmd {
	return nil
}

func (m addResourceGraphEntryListModel) Update(msg tea.Msg) (addResourceGraphEntryListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m addResourceGraphEntryListModel) View() string {
	return m.Model.View()
}

func (l addResourceGraphEntryListModel) SelectedItemId() addResourceGraphEntryListItemId {
	return l.SelectedItem().(addResourceGraphEntryListItemId)
}

type addResourceGraphEntryListItemId string

func (i addResourceGraphEntryListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type addResourceGraphEntryListDelegate struct{}

func (d addResourceGraphEntryListDelegate) Height() int                             { return 1 }
func (d addResourceGraphEntryListDelegate) Spacing() int                            { return 0 }
func (d addResourceGraphEntryListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d addResourceGraphEntryListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(addResourceGraphEntryListItemId)
	if !ok {
		return
	}

	str := string(resourceTemplateIdToData[string(i)].name)

	fn := addResourceGraphEntryListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return addResourceGraphEntryListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

var (
	addResourceGraphApiListTitleBarStyle     = lipgloss.NewStyle()
	addResourceGraphApiListTitleStyle        = lipgloss.NewStyle()
	addResourceGraphApiListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	addResourceGraphApiListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	addResourceGraphApiListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	addResourceGraphApiListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type addResourceGraphApiListModel struct {
	list.Model
}

func newAddResourceGraphApiListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) addResourceGraphApiListModel {
	return addResourceGraphApiListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l addResourceGraphApiListModel) init() tea.Cmd {
	return nil
}

func (m addResourceGraphApiListModel) Update(msg tea.Msg) (addResourceGraphApiListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m addResourceGraphApiListModel) View() string {
	return m.Model.View()
}

func (l addResourceGraphApiListModel) SelectedItemId() addResourceGraphApiListItemId {
	return l.SelectedItem().(addResourceGraphApiListItemId)
}

type addResourceGraphApiListItemId string

func (i addResourceGraphApiListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type addResourceGraphApiListDelegate struct{}

func (d addResourceGraphApiListDelegate) Height() int                             { return 1 }
func (d addResourceGraphApiListDelegate) Spacing() int                            { return 0 }
func (d addResourceGraphApiListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d addResourceGraphApiListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(addResourceGraphApiListItemId)
	if !ok {
		return
	}

	str := string(resourceTemplateIdToData[string(i)].name)

	fn := addResourceGraphApiListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return addResourceGraphApiListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

var (
	addResourceGraphDbListTitleBarStyle     = lipgloss.NewStyle()
	addResourceGraphDbListTitleStyle        = lipgloss.NewStyle()
	addResourceGraphDbListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	addResourceGraphDbListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	addResourceGraphDbListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	addResourceGraphDbListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type addResourceGraphDbListModel struct {
	list.Model
}

func newAddResourceGraphDbListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) addResourceGraphDbListModel {
	return addResourceGraphDbListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l addResourceGraphDbListModel) init() tea.Cmd {
	return nil
}

func (m addResourceGraphDbListModel) Update(msg tea.Msg) (addResourceGraphDbListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m addResourceGraphDbListModel) View() string {
	return m.Model.View()
}

func (l addResourceGraphDbListModel) SelectedItemId() addResourceGraphDbListItemId {
	return l.SelectedItem().(addResourceGraphDbListItemId)
}

type addResourceGraphDbListItemId string

func (i addResourceGraphDbListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type addResourceGraphDbListDelegate struct{}

func (d addResourceGraphDbListDelegate) Height() int                             { return 1 }
func (d addResourceGraphDbListDelegate) Spacing() int                            { return 0 }
func (d addResourceGraphDbListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d addResourceGraphDbListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(addResourceGraphDbListItemId)
	if !ok {
		return
	}

	str := string(resourceTemplateIdToData[string(i)].name)

	fn := addResourceGraphDbListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return addResourceGraphDbListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

type newProjectState int

const (
	NEW_PROJECT_DIR_INPUT_STATE newProjectState = iota
)

type newProjectType struct {
	state    newProjectState
	dirInput textinput.Model
}

func newProjectUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.newProject.state == NEW_PROJECT_DIR_INPUT_STATE {
		switch msg := msg.(type) {
		case txMsg:
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				if m.newProject.dirInput.Value() == "" {
					m.newProject.dirInput.Err = &InputErr{
						Msg: "Directory is required",
					}
					return m, nil
				}
				return m, tx
			}
		}

		var cmd tea.Cmd
		m.newProject.dirInput, cmd = m.newProject.dirInput.Update(msg)
		return m, cmd
	}

	return m, nil
}

func newProjectView(m model) string {
	if m.newProject.state == NEW_PROJECT_DIR_INPUT_STATE {
		return lipgloss.JoinVertical(lipgloss.Top, "Enter dir:", m.newProject.dirInput.View())
	}
	return "Unknown new project state"
}
