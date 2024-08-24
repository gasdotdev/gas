package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	degit "github.com/gasdotdev/gas/tui/internal/degit"
	"github.com/gasdotdev/gas/tui/internal/resources"
	"github.com/gasdotdev/gas/tui/internal/str"
	"github.com/iancoleman/orderedmap"
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
	ADD_RESOURCE
	NEW_PROJECT
)

type model struct {
	mode             mode
	terminalHeight   int
	terminalWidth    int
	resources        *resources.Resources
	addResourceGraph addResourceGraphType
	addResource      addResourceType
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
	newProjectDirInput.Placeholder = "your-project-dir"

	selectPackageManagerList := newSelectPackageManagerListModel(
		[]list.Item{
			selectPackageManagerListItemId("npm"),
		},
		selectPackageManagerListDelegate{},
		0,
		0,
	)
	selectPackageManagerList.Title = "Select package manager:"
	selectPackageManagerList.SetShowStatusBar(false)
	selectPackageManagerList.SetFilteringEnabled(false)
	selectPackageManagerList.Styles.Title = selectPackageManagerListTitleStyle
	selectPackageManagerList.Styles.TitleBar = selectPackageManagerListTitleBarStyle
	selectPackageManagerList.Styles.PaginationStyle = selectPackageManagerListPaginationStyle
	selectPackageManagerList.Styles.HelpStyle = selectPackageManagerListHelpStyle

	confirmEmptyDirInput := textinput.New()
	confirmEmptyDirInput.Placeholder = "y/n"

	addResourceList := newAddResourceListModel(
		[]list.Item{
			addResourceListItemId("cloudflare-pages-remix"),
		},
		addResourceListDelegate{},
		0,
		0,
	)
	addResourceList.Title = "Select resource:"
	addResourceList.SetShowStatusBar(false)
	addResourceList.SetFilteringEnabled(false)
	addResourceList.Styles.Title = addResourceListTitleStyle
	addResourceList.Styles.TitleBar = addResourceListTitleBarStyle
	addResourceList.Styles.PaginationStyle = addResourceListPaginationStyle
	addResourceList.Styles.HelpStyle = addResourceListHelpStyle

	addResourceEntityInput := textinput.New()
	addResourceEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceInputsList := newAddResourceInputsListModel(
		[]list.Item{},
		addResourceInputsListDelegate{},
		0,
		0,
	)
	addResourceInputsList.Title = "Select resource inputs:"
	addResourceInputsList.SetShowStatusBar(false)
	addResourceInputsList.SetFilteringEnabled(false)
	addResourceInputsList.Styles.Title = addResourceInputsListTitleStyle
	addResourceInputsList.Styles.TitleBar = addResourceInputsListTitleBarStyle
	addResourceInputsList.Styles.PaginationStyle = addResourceInputsListPaginationStyle
	addResourceInputsList.Styles.HelpStyle = addResourceInputsListHelpStyle

	return model{
		mode: HOME,
		addResourceGraph: addResourceGraphType{
			entryList:        addResourceGraphEntryList,
			entryEntityInput: addResourceGraphEntryEntityInput,
			apiList:          addResourceGraphApiList,
			dbList:           addResourceGraphDbList,
		},
		addResource: addResourceType{
			list:        addResourceList,
			entityInput: addResourceEntityInput,
			inputsList:  addResourceInputsList,
		},
		newProject: newProjectType{
			dirInput:                 newProjectDirInput,
			selectPackageManagerList: selectPackageManagerList,
			confirmEmptyDirInput:     confirmEmptyDirInput,
		},
	}
}

type txMsg bool

func tx() tea.Msg {
	return txMsg(true)
}

type getResourcesOk *resources.Resources

type getResourcesErr struct {
	err error
}

func getResources() tea.Msg {
	r, err := resources.New()
	if err != nil {
		return getResourcesErr{err: err}
	}
	return getResourcesOk(r)
}

func (m model) Init() tea.Cmd {
	return getResources
	//return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case getResourcesOk:
		m.resources = msg
		return m, nil
	case getResourcesErr:
		return m, nil
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
	} else if m.mode == ADD_RESOURCE {
		return addResourceUpdate(m, msg)
	} else {
		return m, nil
	}
}

func (m model) View() string {
	if m.mode == HOME {
		return homeView(m)
	} else if m.mode == ADD_RESOURCE_GRAPH {
		return addResourceGraphView(m)
	} else if m.mode == NEW_PROJECT {
		return newProjectView(m)
	} else if m.mode == ADD_RESOURCE {
		return addResourceView(m)
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
		case "r":
			m.mode = ADD_RESOURCE
			return m, tx
		}
	}
	return m, nil
}

func homeView(m model) string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Gas.dev", "[g] Add resource graph", "[n] New project", "[r] Add resource")
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
	NEW_PROJECT_DIR_CONFIRM_EMPTY_STATE
	NEW_PROJECT_DIR_ERR_STATE
	NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE
	NEW_PROJECT_CREATING_STATE
	NEW_PROJECT_CREATED_STATE
)

type newProjectType struct {
	state                    newProjectState
	dirInput                 textinput.Model
	dirState                 newProjectDirPathState
	selectPackageManagerList selectPackageManagerListModel
	confirmEmptyDirInput     textinput.Model
	createLogs               []string
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

				resolvedPath, _ := filepath.Abs(m.newProject.dirInput.Value())

				return m, getNewProjectDirPathState(resolvedPath)
			}
		case getNewProjectDirPathStateOk:
			dirState := newProjectDirPathState(msg)
			m.newProject.dirState = dirState
			if dirState == NEW_PROJECT_DIR_PATH_STATE_FULL {
				m.newProject.state = NEW_PROJECT_DIR_CONFIRM_EMPTY_STATE
				return m, tea.Sequence(tx, m.newProject.confirmEmptyDirInput.Focus())
			} else if dirState == NEW_PROJECT_DIR_PATH_STATE_NONE {
				m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE
				return m, tx
			} else if dirState == NEW_PROJECT_DIR_PATH_STATE_EMPTY {
				m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE
				return m, tx
			}
		case getNewProjectDirPathStateErr:
			m.newProject.state = NEW_PROJECT_DIR_ERR_STATE
			m.newProject.dirInput.Err = msg
			return m, nil
		}

		var cmd tea.Cmd
		m.newProject.dirInput, cmd = m.newProject.dirInput.Update(msg)
		return m, cmd
	} else if m.newProject.state == NEW_PROJECT_DIR_CONFIRM_EMPTY_STATE {
		switch msg := msg.(type) {
		case txMsg:
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "y":
				m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE
				m.newProject.confirmEmptyDirInput.SetValue("y")
				return m, tx
			case "n":
				m.newProject.state = NEW_PROJECT_DIR_INPUT_STATE
				m.newProject.confirmEmptyDirInput.SetValue("n")
				return m, tea.Sequence(tx, m.newProject.dirInput.Focus())
			default:
				m.newProject.confirmEmptyDirInput.Err = &InputErr{
					Msg: "y/n is required",
				}
				return m, nil
			}
		}

		var cmd tea.Cmd
		m.newProject.confirmEmptyDirInput, cmd = m.newProject.confirmEmptyDirInput.Update(msg)
		return m, cmd
	} else if m.newProject.state == NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE {
		switch msg := msg.(type) {
		case txMsg:
			m.newProject.selectPackageManagerList.SetSize(m.terminalWidth, m.terminalHeight)
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				m.newProject.state = NEW_PROJECT_CREATING_STATE
				return m, tx
			}
		}

		var cmd tea.Cmd
		m.newProject.selectPackageManagerList, cmd = m.newProject.selectPackageManagerList.Update(msg)
		return m, cmd
	} else if m.newProject.state == NEW_PROJECT_CREATING_STATE {
		repoUrl := "https://github.com/gasdotdev/gas"
		repoBranch := "master"
		extractPath := m.newProject.dirInput.Value()
		repoTemplate := "templates/new-project-npm"

		switch msg := msg.(type) {
		case txMsg:
			if len(m.newProject.createLogs) > 0 {
				return m, tea.ClearScreen
			} else if m.newProject.dirState == NEW_PROJECT_DIR_PATH_STATE_FULL && m.newProject.confirmEmptyDirInput.Value() == "y" {
				m.newProject.createLogs = append(m.newProject.createLogs, "Emptying dir...")
				return m, emptyNewProjectDirPath(m.newProject.dirInput.Value())
			} else if m.newProject.dirState == NEW_PROJECT_DIR_PATH_STATE_EMPTY {
				m.newProject.createLogs = append(m.newProject.createLogs, "Downloading new project template...")

				return m, setupNewProjectTemplate(repoUrl, repoBranch, degit.Paths{
					Repo:    repoTemplate,
					Extract: extractPath,
				})
			} else if m.newProject.dirState == NEW_PROJECT_DIR_PATH_STATE_NONE {
				m.newProject.createLogs = append(m.newProject.createLogs, "Creating "+m.newProject.dirInput.Value())
				return m, createNewProjectDir(m.newProject.dirInput.Value())
			}
		case createNewProjectDirOk:
			m.newProject.createLogs = append(m.newProject.createLogs, "Directory created successfully.")
			return m, setupNewProjectTemplate(repoUrl, repoBranch, degit.Paths{
				Repo:    repoTemplate,
				Extract: extractPath,
			})
		case createNewProjectDirErr:
			m.newProject.state = NEW_PROJECT_DIR_ERR_STATE
			errMsg := fmt.Sprintf("Error creating directory: %v", msg.err)
			m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
			return m, tea.Sequence(tx, tea.Println(errMsg))
		case emptyNewProjectDirPathOk:
			m.newProject.createLogs = append(m.newProject.createLogs, "Directory emptied successfully.")
			return m, setupNewProjectTemplate(repoUrl, repoBranch, degit.Paths{
				Repo:    repoTemplate,
				Extract: extractPath,
			})
		case emptyNewProjectDirPathErr:
			m.newProject.state = NEW_PROJECT_DIR_ERR_STATE
			errMsg := fmt.Sprintf("Error emptying directory: %v", msg.err)
			m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
			return m, tea.Sequence(tx, tea.Println(errMsg))
		case setupNewProjectTemplateOk:
			m.newProject.createLogs = append(m.newProject.createLogs, "Project template set up successfully.")
			return m, installPackages(extractPath, "npm")
		case setupNewProjectTemplateErr:
			m.newProject.state = NEW_PROJECT_DIR_ERR_STATE
			errMsg := fmt.Sprintf("Error setting up project template: %v", msg.err)
			m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
			return m, tea.Sequence(tx, tea.Println(errMsg))
		case installPackagesOk:
			m.newProject.createLogs = append(m.newProject.createLogs, "Packages installed successfully.")
			m.newProject.state = NEW_PROJECT_CREATED_STATE
			return m, tx
		case installPackagesErr:
			m.newProject.state = NEW_PROJECT_DIR_ERR_STATE
			errMsg := fmt.Sprintf("Error installing packages: %v", msg.err)
			m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
			return m, tea.Sequence(tx, tea.Println(errMsg))
		}
	} else if m.newProject.state == NEW_PROJECT_CREATED_STATE {
		switch msg := msg.(type) {
		case txMsg:
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "g":
				m.mode = ADD_RESOURCE_GRAPH
				return m, tx
			}
		}
	}

	return m, nil
}

func newProjectView(m model) string {
	if m.newProject.state == NEW_PROJECT_DIR_INPUT_STATE {
		s := lipgloss.JoinVertical(lipgloss.Top, "Enter dir:", m.newProject.dirInput.View())
		if m.newProject.dirInput.Err != nil {
			var inputErr *InputErr
			switch {
			case errors.As(m.newProject.dirInput.Err, &inputErr):
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.newProject.dirInput.Err)))
			default:
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.newProject.dirInput.Err)))
			}
		}
		return s
	} else if m.newProject.state == NEW_PROJECT_DIR_CONFIRM_EMPTY_STATE {
		s := lipgloss.JoinVertical(lipgloss.Top, "Empty dir?", m.newProject.confirmEmptyDirInput.View())
		if m.newProject.confirmEmptyDirInput.Err != nil {
			var inputErr *InputErr
			switch {
			case errors.As(m.newProject.confirmEmptyDirInput.Err, &inputErr):
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.newProject.confirmEmptyDirInput.Err)))
			default:
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.newProject.confirmEmptyDirInput.Err)))
			}
		}
		return s
	} else if m.newProject.state == NEW_PROJECT_SELECT_PACKAGE_MANAGER_STATE {
		return m.newProject.selectPackageManagerList.View()
	} else if m.newProject.state == NEW_PROJECT_CREATING_STATE {
		var logs strings.Builder
		for _, log := range m.newProject.createLogs {
			logs.WriteString(log + "\n")
		}
		return logs.String()
	} else if m.newProject.state == NEW_PROJECT_CREATED_STATE {
		var logs strings.Builder
		for _, log := range m.newProject.createLogs {
			logs.WriteString(log + "\n")
		}
		logs.WriteString("Project created successfully.")
		logs.WriteString("\n\n")
		logs.WriteString("Press g to add resources to the graph.")
		return logs.String()
	} else if m.newProject.state == NEW_PROJECT_DIR_ERR_STATE {
		return fmt.Sprintf("Error occurred:\n%s", strings.Join(m.newProject.createLogs, "\n"))
	}
	return "Unknown new project state"
}

type newProjectDirPathState string

const (
	NEW_PROJECT_DIR_PATH_STATE_EMPTY newProjectDirPathState = "EMPTY"
	NEW_PROJECT_DIR_PATH_STATE_FULL  newProjectDirPathState = "FULL"
	NEW_PROJECT_DIR_PATH_STATE_NONE  newProjectDirPathState = "NONE"
)

type getNewProjectDirPathStateOk newProjectDirPathState

type getNewProjectDirPathStateErr error

func getNewProjectDirPathState(dirPath string) tea.Cmd {
	return func() tea.Msg {
		dirExists, err := doesDirExist(dirPath)
		if err != nil {
			return getNewProjectDirPathStateErr(err)
		}
		if !dirExists {
			return getNewProjectDirPathStateOk(NEW_PROJECT_DIR_PATH_STATE_NONE)
		}

		files, err := os.ReadDir(dirPath)
		if err != nil {
			return getNewProjectDirPathStateErr(err)
		}
		if len(files) == 0 {
			return getNewProjectDirPathStateOk(NEW_PROJECT_DIR_PATH_STATE_EMPTY)
		}
		return getNewProjectDirPathStateOk(NEW_PROJECT_DIR_PATH_STATE_FULL)
	}
}

func doesDirExist(path string) (bool, error) {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("unable to check if %s dir exists\n%v", path, err)
	}
	return info.IsDir(), nil
}

type createNewProjectDirOk bool

type createNewProjectDirErr struct {
	err error
}

func createNewProjectDir(dirPath string) tea.Cmd {
	return func() tea.Msg {
		err := os.Mkdir(dirPath, 0755)
		if err != nil {
			return createNewProjectDirErr{err: err}
		}
		return createNewProjectDirOk(true)
	}
}

type emptyNewProjectDirPathOk bool

type emptyNewProjectDirPathErr struct {
	err error
}

func emptyNewProjectDirPath(dirPath string) tea.Cmd {
	return func() tea.Msg {
		entries, err := os.ReadDir(dirPath)
		if err != nil {
			return emptyNewProjectDirPathErr{err: err}
		}

		for _, entry := range entries {
			err := os.RemoveAll(filepath.Join(dirPath, entry.Name()))
			if err != nil {
				return emptyNewProjectDirPathErr{err: err}
			}
		}
		return emptyNewProjectDirPathOk(true)
	}
}

type setupNewProjectTemplateOk bool

type setupNewProjectTemplateErr struct {
	err error
}

func setupNewProjectTemplate(repoUrl, branch string, path degit.Paths) tea.Cmd {
	return func() tea.Msg {
		err := degit.Run(repoUrl, branch, []degit.Paths{path})
		if err != nil {
			return setupNewProjectTemplateErr{err: err}
		}

		gasConfigPath := filepath.Join(path.Extract, "gas.config.json")

		gasConfigFile, err := os.ReadFile(gasConfigPath)
		if err != nil {
			errMsg := fmt.Errorf("unable to read template gas.config.json: %w", err)
			return setupNewProjectTemplateErr{err: errMsg}
		}

		var gasConfig orderedmap.OrderedMap
		if err := json.Unmarshal(gasConfigFile, &gasConfig); err != nil {
			errMsg := fmt.Errorf("unable to unmarshal template gas.config.json: %w", err)
			return setupNewProjectTemplateErr{err: errMsg}
		}

		gasConfig.Set("project", str.LowerCaseKebab(filepath.Base(path.Extract)))

		updatedGasConfig, err := json.MarshalIndent(gasConfig, "", "  ")
		if err != nil {
			errMsg := fmt.Errorf("unable to marshal updated gas.config.json: %w", err)
			return setupNewProjectTemplateErr{err: errMsg}
		}

		if err := os.WriteFile(gasConfigPath, updatedGasConfig, 0644); err != nil {
			errMsg := fmt.Errorf("unable to write updated gas.config.json: %w", err)
			return setupNewProjectTemplateErr{err: errMsg}
		}

		return setupNewProjectTemplateOk(true)
	}
}

type installPackagesOk bool

type installPackagesErr struct {
	err error
}

func installPackages(dirPath string, packageManager string) tea.Cmd {
	return func() tea.Msg {
		cmd := exec.Command(packageManager, "install")
		cmd.Dir = dirPath
		if err := cmd.Run(); err != nil {
			return installPackagesErr{err: fmt.Errorf("unable to complete %s install: %w", packageManager, err)}
		}
		return installPackagesOk(true)
	}
}

var (
	selectPackageManagerListTitleBarStyle     = lipgloss.NewStyle()
	selectPackageManagerListTitleStyle        = lipgloss.NewStyle()
	selectPackageManagerListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	selectPackageManagerListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	selectPackageManagerListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	selectPackageManagerListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type selectPackageManagerListModel struct {
	list.Model
}

func newSelectPackageManagerListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) selectPackageManagerListModel {
	return selectPackageManagerListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l selectPackageManagerListModel) init() tea.Cmd {
	return nil
}

func (m selectPackageManagerListModel) Update(msg tea.Msg) (selectPackageManagerListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m selectPackageManagerListModel) View() string {
	return m.Model.View()
}

func (l selectPackageManagerListModel) SelectedItemId() selectPackageManagerListItemId {
	return l.SelectedItem().(selectPackageManagerListItemId)
}

type selectPackageManagerListItemId string

func (i selectPackageManagerListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type selectPackageManagerListDelegate struct{}

func (d selectPackageManagerListDelegate) Height() int                             { return 1 }
func (d selectPackageManagerListDelegate) Spacing() int                            { return 0 }
func (d selectPackageManagerListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d selectPackageManagerListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(selectPackageManagerListItemId)
	if !ok {
		return
	}

	str := string(i)

	fn := selectPackageManagerListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return selectPackageManagerListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

type addResourceState int

const (
	ADD_RESOURCE_LIST_STATE addResourceState = iota
	ADD_RESOURCE_ENTITY_INPUT_STATE
	ADD_RESOURCE_DOWNLOADING_TEMPLATE_STATE
	ADD_RESOURCE_ERR_STATE
	ADD_RESOURCE_CREATED_STATE
	ADD_RESOURCE_INPUTS_STATE
)

type addResourceType struct {
	state       addResourceState
	list        addResourceListModel
	entityInput textinput.Model
	inputsList  addResourceInputsListModel
}

func addResourceUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.addResource.state == ADD_RESOURCE_LIST_STATE {
		switch msg := msg.(type) {
		case txMsg:
			return m, tea.ClearScreen
		case tea.KeyMsg:
			switch msg.String() {
			case "enter":
				m.addResource.state = ADD_RESOURCE_ENTITY_INPUT_STATE
				return m, m.addResource.entityInput.Focus()
			}
		}

		var cmd tea.Cmd
		m.addResource.list, cmd = m.addResource.list.Update(msg)
		return m, cmd
	} else if m.addResource.state == ADD_RESOURCE_ENTITY_INPUT_STATE {
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
				m.addResource.state = ADD_RESOURCE_DOWNLOADING_TEMPLATE_STATE
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
	} else if m.addResource.state == ADD_RESOURCE_DOWNLOADING_TEMPLATE_STATE {
		switch msg := msg.(type) {
		case setupNewResourceOk:
			m.addResource.state = ADD_RESOURCE_INPUTS_STATE
			m.addResource.inputsList.SetItems(
				[]list.Item{
					addResourceInputsListItemId("cloudflare-worker-hono"),
				},
			)
			return m, tx
		case setupNewResourceErr:
			m.addResource.state = ADD_RESOURCE_ERR_STATE
			errMsg := fmt.Sprintf("Error downloading template: %v", msg.err)
			return m, tea.Println(errMsg)
		}
	} else if m.addResource.state == ADD_RESOURCE_INPUTS_STATE {
		return m, nil
	}

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
	if m.addResource.state == ADD_RESOURCE_LIST_STATE {
		return m.addResource.list.View()
	} else if m.addResource.state == ADD_RESOURCE_ENTITY_INPUT_STATE {
		s := lipgloss.JoinVertical(
			lipgloss.Top,
			"Enter resource entity:",
			m.addResource.entityInput.View(),
		)
		if m.addResource.entityInput.Err != nil {
			var inputErr *InputErr
			switch {
			case errors.As(m.addResource.entityInput.Err, &inputErr):
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("%v\n\n", m.addResource.entityInput.Err)))
			default:
				s = lipgloss.JoinVertical(lipgloss.Top, s, inputErrStyle.Render(fmt.Sprintf("Error: %v\n\n", m.addResource.entityInput.Err)))
			}
		}
		return s
	} else if m.addResource.state == ADD_RESOURCE_DOWNLOADING_TEMPLATE_STATE {
		return "Downloading template..."
	} else if m.addResource.state == ADD_RESOURCE_CREATED_STATE {
		return "Template downloaded successfully."
	} else if m.addResource.state == ADD_RESOURCE_INPUTS_STATE {
		return m.addResource.inputsList.View()
	} else if m.addResource.state == ADD_RESOURCE_ERR_STATE {
		return "error"
	}
	return fmt.Sprintf("Unknown add resource state: %v", m.addResource.state)
}

var (
	addResourceListTitleBarStyle     = lipgloss.NewStyle()
	addResourceListTitleStyle        = lipgloss.NewStyle()
	addResourceListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	addResourceListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	addResourceListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	addResourceListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type addResourceListModel struct {
	list.Model
}

func newAddResourceListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) addResourceListModel {
	return addResourceListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l addResourceListModel) init() tea.Cmd {
	return nil
}

func (m addResourceListModel) Update(msg tea.Msg) (addResourceListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m addResourceListModel) View() string {
	return m.Model.View()
}

func (l addResourceListModel) SelectedItemId() addResourceListItemId {
	return l.SelectedItem().(addResourceListItemId)
}

type addResourceListItemId string

func (i addResourceListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type addResourceListDelegate struct{}

func (d addResourceListDelegate) Height() int                             { return 1 }
func (d addResourceListDelegate) Spacing() int                            { return 0 }
func (d addResourceListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d addResourceListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(addResourceListItemId)
	if !ok {
		return
	}

	str := string(resourceTemplateIdToData[string(i)].name)

	fn := addResourceListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return addResourceListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

var (
	addResourceInputsListTitleBarStyle     = lipgloss.NewStyle()
	addResourceInputsListTitleStyle        = lipgloss.NewStyle()
	addResourceInputsListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	addResourceInputsListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	addResourceInputsListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	addResourceInputsListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type addResourceInputsListModel struct {
	list.Model
}

func newAddResourceInputsListModel(items []list.Item, delegate list.ItemDelegate, width int, height int) addResourceInputsListModel {
	return addResourceInputsListModel{
		Model: list.New(items, delegate, width, height),
	}
}

func (l addResourceInputsListModel) init() tea.Cmd {
	return nil
}

func (m addResourceInputsListModel) Update(msg tea.Msg) (addResourceInputsListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m addResourceInputsListModel) View() string {
	return m.Model.View()
}

func (l addResourceInputsListModel) SelectedItemId() addResourceInputsListItemId {
	return l.SelectedItem().(addResourceInputsListItemId)
}

type addResourceInputsListItemId string

func (i addResourceInputsListItemId) FilterValue() string {
	return resourceTemplateIdToData[string(i)].name
}

type addResourceInputsListDelegate struct{}

func (d addResourceInputsListDelegate) Height() int                             { return 1 }
func (d addResourceInputsListDelegate) Spacing() int                            { return 0 }
func (d addResourceInputsListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d addResourceInputsListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(addResourceInputsListItemId)
	if !ok {
		return
	}

	str := string(resourceTemplateIdToData[string(i)].name)

	fn := addResourceInputsListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return addResourceInputsListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}
