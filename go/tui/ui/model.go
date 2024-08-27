package ui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/gasdotdev/gas/tui/config"
	"github.com/gasdotdev/gas/tui/resources"
)

type mode int

const (
	HOME mode = iota
	ADD_RESOURCE_GRAPH
	ADD_RESOURCE
	NEW_PROJECT
)

type model struct {
	mode             mode
	resources        *resources.Resources
	terminalHeight   int
	terminalWidth    int
	addResource      addResourceType
	addResourceGraph addResourceGraphType
	newProject       newProjectType
}

func InitialModel() model {
	resourceTemplates := newTemplates()

	addResourceList := NewListModel(
		"Select resource:",
		resourceTemplates.getTemplateListItems(),
	)

	addResourceEntityInput := textinput.New()
	addResourceEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceInputsList := NewListModel(
		"Select resource inputs:",
		resourceTemplates.getTemplateListItems(),
	)

	addResourceGraphEntryList := NewListModel(
		"Select entry resource:",
		resourceTemplates.getEntryTemplateListItems(),
	)

	addResourceGraphEntryEntityInput := textinput.New()
	addResourceGraphEntryEntityInput.Placeholder = "app, dashboard, landing, etc"

	addResourceGraphApiList := NewListModel(
		"Select api resource:",
		resourceTemplates.getApiTemplateListItems(),
	)

	addResourceGraphDbList := NewListModel(
		"Select db resource:",
		resourceTemplates.getDbTemplateListItems(),
	)

	newProjectDirInput := textinput.New()
	newProjectDirInput.Placeholder = "your-project-dir"

	packageManagerListItems := []ListItem{
		{Id: "npm", Option: "npm"},
	}

	selectPackageManagerList := NewListModel(
		"Select package manager:",
		packageManagerListItems,
	)

	confirmEmptyDirInput := textinput.New()
	confirmEmptyDirInput.Placeholder = "y/n"

	return model{
		mode: HOME,
		addResource: addResourceType{
			list:        addResourceList,
			entityInput: addResourceEntityInput,
			inputsList:  addResourceInputsList,
		},
		addResourceGraph: addResourceGraphType{
			entryList:        addResourceGraphEntryList,
			entryEntityInput: addResourceGraphEntryEntityInput,
			apiList:          addResourceGraphApiList,
			dbList:           addResourceGraphDbList,
		},
		newProject: newProjectType{
			dirInput:                 newProjectDirInput,
			selectPackageManagerList: selectPackageManagerList,
			confirmEmptyDirInput:     confirmEmptyDirInput,
		},
	}
}

var modes = newRegister[model]()

type getResourcesOk *resources.Resources

type getResourcesErr struct {
	err error
}

func getResources() tea.Msg {
	config, err := config.New()
	if err != nil {
		return getResourcesErr{err: err}
	}

	r, err := resources.New(config.ContainerDirPath)
	if err != nil {
		return getResourcesErr{err: err}
	}
	return getResourcesOk(r)
}

func (m model) Init() tea.Cmd {
	modes.register(int(HOME), regsiterFns[model]{
		Update: homeUpdate,
		View:   homeView,
	})

	modes.register(int(ADD_RESOURCE), regsiterFns[model]{
		Update: addResourceUpdate,
		View:   addResourceView,
	})

	addResourceStates.register(int(ADD_RESOURCE_LIST), regsiterFns[model]{
		Update: addResourceListUpdate,
		View:   addResourceListView,
	})

	addResourceStates.register(int(ADD_RESOURCE_ENTITY_INPUT), regsiterFns[model]{
		Update: addResourceEntityInputUpdate,
		View:   addResourceEntityInputView,
	})

	addResourceStates.register(int(ADD_RESOURCE_DOWNLOADING_TEMPLATE), regsiterFns[model]{
		Update: addResourceDownloadingTemplateUpdate,
		View:   addResourceDownloadingTemplateView,
	})

	addResourceStates.register(int(ADD_RESOURCE_ERR), regsiterFns[model]{
		View: addResourceErrView,
	})

	addResourceStates.register(int(ADD_RESOURCE_INPUTS), regsiterFns[model]{
		Update: addResourceInputsUpdate,
		View:   addResourceInputsView,
	})

	modes.register(int(ADD_RESOURCE_GRAPH), regsiterFns[model]{
		Update: addResourceGraphUpdate,
		View:   addResourceGraphView,
	})

	addResourceGraphStates.register(int(ADD_RESOURCE_GRAPH_ENTRY_LIST), regsiterFns[model]{
		Update: addResourceGraphEntryListUpdate,
		View:   addResourceGraphEntryListView,
	})

	addResourceGraphStates.register(int(ADD_RESOURCE_GRAPH_ENTRY_ENTITY_INPUT), regsiterFns[model]{
		Update: addResourceGraphEntryEntityInputUpdate,
		View:   addResourceGraphEntryEntityInputView,
	})

	addResourceGraphStates.register(int(ADD_RESOURCE_GRAPH_API_LIST), regsiterFns[model]{
		Update: addResourceGraphApiListUpdate,
		View:   addResourceGraphApiListView,
	})

	addResourceGraphStates.register(int(ADD_RESOURCE_GRAPH_DB_LIST), regsiterFns[model]{
		Update: addResourceGraphDbListUpdate,
		View:   addResourceGraphDbListView,
	})

	modes.register(int(NEW_PROJECT), regsiterFns[model]{
		Update: newProjectUpdate,
		View:   newProjectView,
	})

	newProjectStates.register(int(NEW_PROJECT_DIR_INPUT), regsiterFns[model]{
		Update: newProjectDirInputUpdate,
		View:   newProjectDirInputView,
	})

	newProjectStates.register(int(NEW_PROJECT_DIR_CONFIRM_EMPTY), regsiterFns[model]{
		Update: newProjectDirConfirmEmptyUpdate,
		View:   newProjectDirConfirmEmptyView,
	})

	newProjectStates.register(int(NEW_PROJECT_SELECT_PACKAGE_MANAGER), regsiterFns[model]{
		Update: newProjectSelectPackageManagerUpdate,
		View:   newProjectSelectPackageManagerView,
	})

	newProjectStates.register(int(NEW_PROJECT_CREATING), regsiterFns[model]{
		Update: newProjectCreatingUpdate,
		View:   newProjectCreatingView,
	})

	newProjectStates.register(int(NEW_PROJECT_CREATED), regsiterFns[model]{
		Update: newProjectCreatedUpdate,
		View:   newProjectCreatedView,
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
