package ui

import tea "github.com/charmbracelet/bubbletea"

type register[M any] struct {
	Fns map[int]regsiterFns[M]
}

type regsiterFns[M any] struct {
	Update updateFn[M]
	View   viewFn[M]
}

type (
	updateFn[M any] func(m M, msg tea.Msg) (tea.Model, tea.Cmd)
	viewFn[M any]   func(m M) string
)

func newRegister[M any]() *register[M] {
	return &register[M]{
		Fns: make(map[int]regsiterFns[M]),
	}
}

func (r *register[M]) register(state int, fns regsiterFns[M]) {
	r.Fns[state] = fns
}
