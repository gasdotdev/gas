package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/gasdotdev/gas/tui/degit"
	"github.com/gasdotdev/gas/tui/resources"
	"github.com/gasdotdev/gas/tui/str"
	"github.com/gasdotdev/gas/tui/ui"
	"github.com/gasdotdev/gas/tui/ui/components"
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

func inititialModel() model {
	resourceTemplates := resources.NewTemplates()

	resourceTemplates.GetEntryTemplateListItems()

	addResourceGraphEntryList := components.NewListModel(
		"Select entry resource:",
		resourceTemplates.GetEntryTemplateListItems(),
	)

	addResourceGraphEntryEntityInput := textinput.New()
	addResourceGraphEntryEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceGraphApiList := components.NewListModel(
		"Select api resource:",
		resourceTemplates.GetApiTemplateListItems(),
	)

	addResourceGraphDbList := components.NewListModel(
		"Select db resource:",
		resourceTemplates.GetDbTemplateListItems(),
	)

	newProjectDirInput := textinput.New()
	newProjectDirInput.Placeholder = "your-project-dir"

	packageManagerListItems := []components.ListItem{
		{Id: "npm", Option: "npm"},
	}

	selectPackageManagerList := components.NewListModel(
		"Select package manager:",
		packageManagerListItems,
	)

	confirmEmptyDirInput := textinput.New()
	confirmEmptyDirInput.Placeholder = "y/n"

	addResourceList := components.NewListModel(
		"Select resource:",
		resourceTemplates.GetTemplateListItems(),
	)

	addResourceEntityInput := textinput.New()
	addResourceEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceInputsList := components.NewListModel(
		"Select resource inputs:",
		resourceTemplates.GetTemplateListItems(),
	)

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

var modes = ui.NewRegister[model]()

var states = ui.NewRegister[model]()

func (m model) Init() tea.Cmd {
	modes.Register(int(HOME), ui.Fns[model]{
		Update: homeUpdate,
		View:   homeView,
	})

	modes.Register(int(ADD_RESOURCE_GRAPH), ui.Fns[model]{
		Update: addResourceGraphUpdate,
		View:   addResourceGraphView,
	})

	modes.Register(int(ADD_RESOURCE), ui.Fns[model]{
		Update: addResourceUpdate,
		View:   addResourceView,
	})

	modes.Register(int(NEW_PROJECT), ui.Fns[model]{
		Update: newProjectUpdate,
		View:   newProjectView,
	})

	states.Register(int(ADD_RESOURCE_GRAPH_ENTRY_LIST), ui.Fns[model]{
		Update: addResourceGraphEntryListUpdate,
		View:   addResourceGraphEntryListView,
	})

	states.Register(int(ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT), ui.Fns[model]{
		Update: addResourceGraphEntryEntityInputUpdate,
		View:   addResourceGraphEntryEntityInputView,
	})

	states.Register(int(ADD_RESOURCE_GRAPH_API_LIST), ui.Fns[model]{
		Update: addResourceGraphApiListUpdate,
		View:   addResourceGraphApiListView,
	})

	states.Register(int(ADD_RESOURCE_GRAPH_DB_LIST), ui.Fns[model]{
		Update: addResourceGraphDbListUpdate,
		View:   addResourceGraphDbListView,
	})

	states.Register(int(NEW_PROJECT_DIR_INPUT), ui.Fns[model]{
		Update: newProjectDirInputUpdate,
		View:   newProjectDirInputView,
	})

	states.Register(int(NEW_PROJECT_DIR_CONFIRM_EMPTY), ui.Fns[model]{
		Update: newProjectDirConfirmEmptyUpdate,
		View:   newProjectDirConfirmEmptyView,
	})

	states.Register(int(NEW_PROJECT_SELECT_PACKAGE_MANAGER), ui.Fns[model]{
		Update: newProjectSelectPackageManagerUpdate,
		View:   newProjectSelectPackageManagerView,
	})

	states.Register(int(NEW_PROJECT_CREATING), ui.Fns[model]{
		Update: newProjectCreatingUpdate,
		View:   newProjectCreatingView,
	})

	states.Register(int(NEW_PROJECT_CREATED), ui.Fns[model]{
		Update: newProjectCreatedUpdate,
		View:   newProjectCreatedView,
	})

	states.Register(int(ADD_RESOURCE_LIST), ui.Fns[model]{
		Update: addResourceListUpdate,
		View:   addResourceListView,
	})

	states.Register(int(ADD_RESOURCE_ENTITY_INPUT), ui.Fns[model]{
		Update: addResourceEntityInputUpdate,
		View:   addResourceEntityInputView,
	})

	states.Register(int(ADD_RESOURCE_DOWNLOADING_TEMPLATE), ui.Fns[model]{
		Update: addResourceDownloadingTemplateUpdate,
		View:   addResourceDownloadingTemplateView,
	})

	states.Register(int(ADD_RESOURCE_ERR), ui.Fns[model]{
		View: addResourceErrView,
	})

	states.Register(int(ADD_RESOURCE_INPUTS), ui.Fns[model]{
		Update: addResourceInputsUpdate,
		View:   addResourceInputsView,
	})

	return getResources
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

	modeFn, ok := modes.Fns[int(m.mode)]
	if !ok {
		return m, nil
	}
	return modeFn.Update(m, msg)
}

func (m model) View() string {
	modeFn, ok := modes.Fns[int(m.mode)]
	if !ok {
		s := fmt.Sprintf("Unknown mode: %d\n\n", m.mode)
		return s
	}
	return modeFn.View(m)
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
	ADD_RESOURCE_GRAPH_ENTRY_LIST addResourceGraphState = iota
	ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT
	ADD_RESOURCE_GRAPH_API_LIST
	ADD_RESOURCE_GRAPH_DB_LIST
)

type addResourceGraphType struct {
	state            addResourceGraphState
	entryList        components.ListModel
	entryEntityInput textinput.Model
	apiList          components.ListModel
	dbList           components.ListModel
}

type InputErr struct {
	Msg string
}

func (e *InputErr) Error() string {
	return e.Msg
}

func addResourceGraphUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := states.Fns[int(m.addResourceGraph.state)]
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
				m.addResourceGraph.entryEntityInput.Err = &InputErr{
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

var inputErrStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))

func addResourceGraphView(m model) string {
	stateFn, ok := states.Fns[int(m.addResourceGraph.state)]
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
		var inputErr *InputErr
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

type newProjectState int

const (
	NEW_PROJECT_DIR_INPUT newProjectState = iota
	NEW_PROJECT_DIR_CONFIRM_EMPTY
	NEW_PROJECT_DIR_ERR
	NEW_PROJECT_SELECT_PACKAGE_MANAGER
	NEW_PROJECT_CREATING
	NEW_PROJECT_CREATED
)

type newProjectType struct {
	state                    newProjectState
	dirInput                 textinput.Model
	dirState                 newProjectDirPathState
	selectPackageManagerList components.ListModel
	confirmEmptyDirInput     textinput.Model
	createLogs               []string
}

func newProjectUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := states.Fns[int(m.newProject.state)]
	if !ok {
		s := fmt.Sprintf("Unknown new project state: %d\n\n", m.newProject.state)
		return m, tea.Sequence(tx, tea.Println(s))
	}
	return stateFn.Update(m, msg)
}

func newProjectDirInputUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
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
			m.newProject.state = NEW_PROJECT_DIR_CONFIRM_EMPTY
			return m, tea.Sequence(tx, m.newProject.confirmEmptyDirInput.Focus())
		} else if dirState == NEW_PROJECT_DIR_PATH_STATE_NONE {
			m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER
			return m, tx
		} else if dirState == NEW_PROJECT_DIR_PATH_STATE_EMPTY {
			m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER
			return m, tx
		}
	case getNewProjectDirPathStateErr:
		m.newProject.state = NEW_PROJECT_DIR_ERR
		m.newProject.dirInput.Err = msg
		return m, nil
	}

	var cmd tea.Cmd
	m.newProject.dirInput, cmd = m.newProject.dirInput.Update(msg)
	return m, cmd
}

func newProjectDirConfirmEmptyUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "y":
			m.newProject.state = NEW_PROJECT_SELECT_PACKAGE_MANAGER
			m.newProject.confirmEmptyDirInput.SetValue("y")
			return m, tx
		case "n":
			m.newProject.state = NEW_PROJECT_DIR_INPUT
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
}

func newProjectSelectPackageManagerUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		m.newProject.selectPackageManagerList.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.newProject.state = NEW_PROJECT_CREATING
			return m, tx
		}
	}

	var cmd tea.Cmd
	m.newProject.selectPackageManagerList, cmd = m.newProject.selectPackageManagerList.Update(msg)
	return m, cmd
}

func newProjectCreatingUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
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
		m.newProject.state = NEW_PROJECT_DIR_ERR
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
		m.newProject.state = NEW_PROJECT_DIR_ERR
		errMsg := fmt.Sprintf("Error emptying directory: %v", msg.err)
		m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
		return m, tea.Sequence(tx, tea.Println(errMsg))
	case setupNewProjectTemplateOk:
		m.newProject.createLogs = append(m.newProject.createLogs, "Project template set up successfully.")
		return m, installPackages(extractPath, "npm")
	case setupNewProjectTemplateErr:
		m.newProject.state = NEW_PROJECT_DIR_ERR
		errMsg := fmt.Sprintf("Error setting up project template: %v", msg.err)
		m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
		return m, tea.Sequence(tx, tea.Println(errMsg))
	case installPackagesOk:
		m.newProject.createLogs = append(m.newProject.createLogs, "Packages installed successfully.")
		m.newProject.state = NEW_PROJECT_CREATED
		return m, tx
	case installPackagesErr:
		m.newProject.state = NEW_PROJECT_DIR_ERR
		errMsg := fmt.Sprintf("Error installing packages: %v", msg.err)
		m.newProject.createLogs = append(m.newProject.createLogs, errMsg)
		return m, tea.Sequence(tx, tea.Println(errMsg))
	}
	return m, nil
}

func newProjectCreatedUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
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
	return m, nil
}

func newProjectView(m model) string {
	stateFn, ok := states.Fns[int(m.newProject.state)]
	if !ok {
		s := fmt.Sprintf("Unknown new project state: %d\n\n", m.newProject.state)
		return s
	}
	return stateFn.View(m)
}

func newProjectDirInputView(m model) string {
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
}

func newProjectDirConfirmEmptyView(m model) string {
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
}

func newProjectSelectPackageManagerView(m model) string {
	return m.newProject.selectPackageManagerList.View()
}

func newProjectCreatingView(m model) string {
	var logs strings.Builder
	for _, log := range m.newProject.createLogs {
		logs.WriteString(log + "\n")
	}
	return logs.String()
}

func newProjectCreatedView(m model) string {
	var logs strings.Builder
	for _, log := range m.newProject.createLogs {
		logs.WriteString(log + "\n")
	}
	logs.WriteString("Project created successfully.")
	logs.WriteString("\n\n")
	logs.WriteString("Press g to add resources to the graph.")
	return logs.String()
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
	list        components.ListModel
	entityInput textinput.Model
	inputsList  components.ListModel
}

func addResourceUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := states.Fns[int(m.addResource.state)]
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
				components.ListItem{Id: "cloudflare-worker-hono", Option: "Cloudflare Worker Hono"},
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
	stateFn, ok := states.Fns[int(m.addResource.state)]
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
		var inputErr *InputErr
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
