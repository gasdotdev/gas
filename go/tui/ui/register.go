package ui

import tea "github.com/charmbracelet/bubbletea"

type register[M any] struct {
	Fns map[int]Fns[M]
}

type Fns[M any] struct {
	Update updateFn[M]
	View   viewFn[M]
}

type (
	updateFn[M any] func(m M, msg tea.Msg) (tea.Model, tea.Cmd)
	viewFn[M any]   func(m M) string
)

func NewRegister[M any]() *register[M] {
	return &register[M]{
		Fns: make(map[int]Fns[M]),
	}
}

func (r *register[M]) Register(state int, fns Fns[M]) {
	r.Fns[state] = fns
}
