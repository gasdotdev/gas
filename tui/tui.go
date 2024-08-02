package main

import (
	"fmt"
	"os"
	"strings"

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

type model struct {
	screen         screen
	terminalHeight int
	terminalWidth  int
}

type screen int

const (
	HOME screen = iota
)

func inititialModel() model {
	return model{
		screen: HOME,
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
	switch msg.(type) {
	case txMsg:
		return m, tea.ClearScreen
	}
	return m, nil
}

func homeView(m model) string {

	// Dark red to orange.
	gradientColors := []string{"#8B0000", "#A30000", "#BB0000", "#D30000", "#EB0000", "#FF3300", "#FF6600"}

	title1 := `
 ██████╗   █████╗   ███████╗     ██████╗  ███████╗ ██╗   ██╗
 ██╔════╝  ██╔══██╗ ██╔════╝     ██╔══██╗ ██╔════╝ ██║   ██║
 ██║  ███╗ ███████║ ███████╗     ██║  ██║ █████╗   ██║   ██║
 ██║   ██║ ██╔══██║ ╚════██║     ██║  ██║ ██╔══╝   ╚██╗ ██╔╝
 ╚██████╔╝ ██║  ██║ ███████║ ██╗ ██████╔╝ ███████╗  ╚████╔╝ 
  ╚═════╝  ╚═╝  ╚═╝ ╚══════╝ ╚═╝ ╚═════╝  ╚══════╝   ╚═══╝`

	coloredTitle1 := applyGradient(title1, gradientColors)

	title2 := `
   ___     _     ___       ___    ___  _    _ 
  / __|   /_\   / __|     |   \  | __| \ \ / /
 | (_ |  / _ \  \__ \     | |) | | _|   \ V / 
  \___| /_/ \_\ |___/ (_) |___/  |___|   \_/ 
	`

	coloredTitle2 := applyGradient(title2, gradientColors)

	title3 := `
	█▀▀ ▄▀█ █▀▀   █▀▄ █▀▀ █ █
	█▄█ █▀█ ▄▄█ ▄ █▄▀ ██▄ ▀▄▀
	`

	coloredTitle3 := applyGradient(title3, gradientColors)

	s := lipgloss.JoinVertical(lipgloss.Top, coloredTitle1, coloredTitle2, coloredTitle3)

	return s
}

func applyGradient(text string, colors []string) string {
	lines := strings.Split(text, "\n")
	var coloredText strings.Builder
	for i, line := range lines {
		if len(strings.TrimSpace(line)) > 0 {
			colorIndex := i * len(colors) / len(lines)
			coloredLine := lipgloss.NewStyle().Foreground(lipgloss.Color(colors[colorIndex])).Render(line)
			coloredText.WriteString(coloredLine + "\n")
		}
	}
	return coloredText.String()
}
