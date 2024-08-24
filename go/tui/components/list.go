package components

import (
	"fmt"
	"io"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	ListTitleBarStyle     = lipgloss.NewStyle()
	ListTitleStyle        = lipgloss.NewStyle()
	ListItemStyle         = lipgloss.NewStyle().PaddingLeft(2)
	ListSelectedItemStyle = lipgloss.NewStyle().PaddingLeft(0)
	ListPaginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	ListHelpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(0)
)

type ListModel struct {
	list.Model
	itemIdToData map[string]interface{}
}

func NewListModel(items []list.Item, delegate list.ItemDelegate, width int, height int, itemIdToData map[string]interface{}) ListModel {
	return ListModel{
		Model:        list.New(items, delegate, width, height),
		itemIdToData: itemIdToData,
	}
}

func (l ListModel) Init() tea.Cmd {
	return nil
}

func (m ListModel) Update(msg tea.Msg) (ListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m ListModel) View() string {
	return m.Model.View()
}

func (l ListModel) SelectedItemId() ListItemId {
	return l.SelectedItem().(ListItemId)
}

type ListItemId string

func (i ListItemId) FilterValue() string {
	return i.String()
}

func (i ListItemId) String() string {
	return string(i)
}

type ListDelegate struct {
	itemIdToData map[string]interface{}
}

func NewListDelegate(itemIdToData map[string]interface{}) ListDelegate {
	return ListDelegate{itemIdToData: itemIdToData}
}

func (d ListDelegate) Height() int                             { return 1 }
func (d ListDelegate) Spacing() int                            { return 0 }
func (d ListDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d ListDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(ListItemId)
	if !ok {
		return
	}

	item, ok := d.itemIdToData[i.String()]
	if !ok {
		return
	}

	str, ok := item.(map[string]interface{})["name"].(string)
	if !ok {
		return
	}

	fn := ListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return ListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}
