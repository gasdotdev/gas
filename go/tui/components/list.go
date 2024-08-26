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
}

type ListItem struct {
	Id     string
	Option string
}

func NewListModel(title string, items []ListItem) ListModel {
	width := 25
	height := 20

	listItems := make([]list.Item, len(items))
	for i, v := range items {
		listItems[i] = v
	}

	m := ListModel{
		Model: list.New(listItems, itemDelegate{}, width, height),
	}

	m.Title = title
	m.SetShowStatusBar(false)
	m.SetShowHelp(false)

	return m
}

func (m ListModel) Update(msg tea.Msg) (ListModel, tea.Cmd) {
	var cmd tea.Cmd
	m.Model, cmd = m.Model.Update(msg)
	return m, cmd
}

func (m ListModel) View() string {
	return m.Model.View()
}

func (i ListItem) FilterValue() string { return "" }

type itemDelegate struct{}

func (d itemDelegate) Height() int                             { return 1 }
func (d itemDelegate) Spacing() int                            { return 0 }
func (d itemDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d itemDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(ListItem)
	if !ok {
		return
	}

	str := fmt.Sprintf("%d. %s", index+1, i.Option)

	fn := ListItemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return ListSelectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

func (l ListModel) SelectedItemId() string {
	if item, ok := l.SelectedItem().(ListItem); ok {
		return item.Id
	}
	return ""
}
