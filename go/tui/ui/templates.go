package ui

import (
	"sort"
)

type templates struct {
	templates              []template
	apiTemplateListItems   []ListItem
	dbTemplateListItems    []ListItem
	entryTemplateListItems []ListItem
	templateListItems      []ListItem
}

type template struct {
	Id      string
	Name    string
	IsEntry bool
	IsApi   bool
	IsDb    bool
}

func newTemplates() *templates {
	var t = []template{
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

	return &templates{
		templates: t,
	}
}

func (t *templates) getApiTemplateListItems() []ListItem {
	if t.apiTemplateListItems != nil {
		return t.apiTemplateListItems
	}

	items := []ListItem{}
	for _, template := range t.templates {
		if template.IsApi {
			items = append(items, ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.apiTemplateListItems = items

	return items
}

func (t *templates) getDbTemplateListItems() []ListItem {
	if t.dbTemplateListItems != nil {
		return t.dbTemplateListItems
	}

	items := []ListItem{}
	for _, template := range t.templates {
		if template.IsDb {
			items = append(items, ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.dbTemplateListItems = items

	return items
}

// Entry templates are the starting points for building a new resource graph. They
// have an in-degree of 0. E.g. Cloudflare Pages + Remix.
func (t *templates) getEntryTemplateListItems() []ListItem {
	if t.entryTemplateListItems != nil {
		return t.entryTemplateListItems
	}

	items := []ListItem{}
	for _, template := range t.templates {
		if template.IsEntry {
			items = append(items, ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.entryTemplateListItems = items

	return items
}

func (t *templates) getTemplateListItems() []ListItem {
	if t.templateListItems != nil {
		return t.templateListItems
	}

	items := []ListItem{}
	for _, template := range t.templates {
		items = append(items, ListItem{Id: template.Id, Option: template.Name})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.templateListItems = items

	return items
}
