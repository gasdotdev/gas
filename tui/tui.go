package main

import (
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/list"
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

type addResourceGraphEntryListType struct {
	list addResourceGraphEntryListModel
}

type screen int

const (
	HOME screen = iota
	ADD_RESOURCE_GRAPH_ENTRY_LIST
	ADD_RESOURCE_GRAPH_ENTITY_INPUT
)

type model struct {
	screen                    screen
	terminalHeight            int
	terminalWidth             int
	addResourceGraphEntryList addResourceGraphEntryListType
}

type resourceTemplateData struct {
	name    string
	isEntry bool
}

type resourceTemplateIdToDataType map[string]resourceTemplateData

var resourceTemplateIdToData = resourceTemplateIdToDataType{
	"cloudflare-pages-remix": {name: "Cloudflare Pages + Remix", isEntry: true},
	"cloudflare-worker-hono": {name: "Cloudflare Worker + Hono", isEntry: true},
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

func inititialModel() model {
	addResourceGraphEntryOrderedListItems := setAddResourceGraphEntryOrderedListItems()

	addResourceGraphEntryList := newAddResourceGraphEntryListModel(
		addResourceGraphEntryOrderedListItems,
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

	return model{
		screen: HOME,
		addResourceGraphEntryList: addResourceGraphEntryListType{
			list: addResourceGraphEntryList,
		},
	}
}

type ui[M any] struct {
	Fns map[int]uiFns[M]
}

type uiFns[M any] struct {
	update updateFn[M]
	view   viewFn[M]
}

type (
	updateFn[M any] func(m M, msg tea.Msg) (tea.Model, tea.Cmd)
	viewFn[M any]   func(m M) string
)

func uiNew[M any]() *ui[M] {
	return &ui[M]{
		Fns: make(map[int]uiFns[M]),
	}
}

func (u *ui[M]) register(state int, fns uiFns[M]) {
	u.Fns[state] = fns
}

type txMsg bool

func tx() tea.Msg {
	return txMsg(true)
}

var screens = uiNew[model]()

func (m model) Init() tea.Cmd {
	screens.register(int(HOME), uiFns[model]{
		update: homeUpdate,
		view:   homeView,
	})

	screens.register(int(ADD_RESOURCE_GRAPH_ENTRY_LIST), uiFns[model]{
		update: addResourceGraphEntryListUpdate,
		view:   addResourceGraphEntryListView,
	})

	screens.register(int(ADD_RESOURCE_GRAPH_ENTITY_INPUT), uiFns[model]{
		update: addResourceGraphEntityInputUpdate,
		view:   addResourceGraphEntityInputView,
	})

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

	screenFn, ok := screens.Fns[int(m.screen)]
	if !ok {
		return m, nil
	}
	return screenFn.update(m, msg)
}

func (m model) View() string {
	screenFn, ok := screens.Fns[int(m.screen)]
	if !ok {
		s := fmt.Sprintf("Unknown screen: %d\n\n", m.screen)
		s += "Verify screen, update, and view are registered."
		return s
	}
	return screenFn.view(m)
}

func homeUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlG:
			m.screen = ADD_RESOURCE_GRAPH_ENTRY_LIST
			return m, tx
		}
	}
	return m, nil
}

func homeView(m model) string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Gas.dev", "[ctrl+g] Add resource graph")
	return s
}

func addResourceGraphEntryListUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case txMsg:
		m.addResourceGraphEntryList.list.SetSize(m.terminalWidth, m.terminalHeight)
		return m, tea.ClearScreen
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.screen = ADD_RESOURCE_GRAPH_ENTITY_INPUT
			return m, tx
		}
	}

	var cmd tea.Cmd
	m.addResourceGraphEntryList.list, cmd = m.addResourceGraphEntryList.list.Update(msg)
	return m, cmd
}

func addResourceGraphEntryListView(m model) string {
	return m.addResourceGraphEntryList.list.View()
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

func addResourceGraphEntityInputUpdate(m model, msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	}

	return m, nil
}

func addResourceGraphEntityInputView(m model) string {
	s := lipgloss.JoinVertical(lipgloss.Top, "Add resource graph entity input view", string(m.addResourceGraphEntryList.list.SelectedItemId()))
	return s
}
