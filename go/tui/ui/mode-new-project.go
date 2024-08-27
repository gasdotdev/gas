package ui

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/gasdotdev/gas/tui/degit"
	"github.com/gasdotdev/gas/tui/str"
	"github.com/iancoleman/orderedmap"
)

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
	selectPackageManagerList ListModel
	confirmEmptyDirInput     textinput.Model
	createLogs               []string
}

var newProjectStates = newRegister[model]()

func newProjectUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	stateFn, ok := newProjectStates.Fns[int(m.newProject.state)]
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
				m.newProject.dirInput.Err = &inputErr{
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
			m.newProject.confirmEmptyDirInput.Err = &inputErr{
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
	stateFn, ok := newProjectStates.Fns[int(m.newProject.state)]
	if !ok {
		s := fmt.Sprintf("Unknown new project state: %d\n\n", m.newProject.state)
		return s
	}
	return stateFn.View(m)
}

func newProjectDirInputView(m model) string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Enter dir:", m.newProject.dirInput.View())
	if m.newProject.dirInput.Err != nil {
		var inputErr *inputErr
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
		var inputErr *inputErr
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

		gitkeepPath := filepath.Join(path.Extract, "gas", ".gitkeep")
		if err := os.Remove(gitkeepPath); err != nil {
			if !os.IsNotExist(err) {
				errMsg := fmt.Errorf("unable to remove gas/.gitkeep: %w", err)
				return setupNewProjectTemplateErr{err: errMsg}
			}
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
