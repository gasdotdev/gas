package resources

import (
	"sort"

	"github.com/gasdotdev/gas/tui/components"
)

type Templates struct {
	Templates              []Template
	ApiTemplateListItems   []components.ListItem
	EntryTemplateListItems []components.ListItem
}

type Template struct {
	Id      string
	Name    string
	IsEntry bool
	IsApi   bool
	IsDb    bool
}

var templates = []Template{
	{
		Id:      "cloudflare-pages-remix",
		Name:    "Cloudflare Pages + Remix",
		IsEntry: true,
		IsApi:   false,
		IsDb:    false,
	},
	{
		Id:      "cloudflare-worker-hono",
		Name:    "Cloudflare Worker + Hono",
		IsEntry: true,
		IsApi:   true,
		IsDb:    false,
	},
	{
		Id:      "cloudflare-d1",
		Name:    "Cloudflare D1",
		IsEntry: false,
		IsApi:   false,
		IsDb:    true,
	},
}

func NewTemplates() *Templates {
	return &Templates{
		Templates: templates,
	}
}

func (t *Templates) SetApiTemplateListItems() {
	items := []components.ListItem{}
	for _, template := range t.Templates {
		if template.IsApi {
			items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.ApiTemplateListItems = items
}

func (t *Templates) SetEntryTemplateListItems() {
	items := []components.ListItem{}
	for _, template := range t.Templates {
		if template.IsEntry {
			items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.EntryTemplateListItems = items
}
