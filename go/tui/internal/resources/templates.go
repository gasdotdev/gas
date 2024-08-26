package resources

import (
	"sort"

	"github.com/gasdotdev/gas/tui/components"
)

type templates struct {
	templates              []template
	apiTemplateListItems   []components.ListItem
	dbTemplateListItems    []components.ListItem
	entryTemplateListItems []components.ListItem
	templateListItems      []components.ListItem
}

type template struct {
	Id      string
	Name    string
	IsEntry bool
	IsApi   bool
	IsDb    bool
}

// NewTemplates returns a new templates instance.
// Actual templates are found in the `templates` directory.
func NewTemplates() *templates {
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

// GetApiTemplateListItems returns the API template list items in ABC order.
// The list items are passed to the list component.
// If the list items have already been generated, it returns the cached list items.
// Otherwise, it generates the list items and returns them.
func (t *templates) GetApiTemplateListItems() []components.ListItem {
	if t.apiTemplateListItems != nil {
		return t.apiTemplateListItems
	}

	items := []components.ListItem{}
	for _, template := range t.templates {
		if template.IsApi {
			items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.apiTemplateListItems = items
	return items
}

// GetDbTemplateListItems returns the DB template list items in ABC order.
// The list items are passed to the list component.
// If the list items have already been generated, it returns the cached list items.
// Otherwise, it generates the list items and returns them.
func (t *templates) GetDbTemplateListItems() []components.ListItem {
	if t.dbTemplateListItems != nil {
		return t.dbTemplateListItems
	}

	items := []components.ListItem{}
	for _, template := range t.templates {
		if template.IsDb {
			items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.dbTemplateListItems = items
	return items
}

// GetEntryTemplateListItems returns the entry template list items in ABC order.
// The list items are passed to the list component.
// Entry templates are the starting points for building a new resource graph. They
// have an in-degree of 0. E.g. Cloudflare Pages + Remix.
// If the list items have already been generated, it returns the cached list items.
// Otherwise, it generates the list items and returns them.
func (t *templates) GetEntryTemplateListItems() []components.ListItem {
	if t.entryTemplateListItems != nil {
		return t.entryTemplateListItems
	}

	items := []components.ListItem{}
	for _, template := range t.templates {
		if template.IsEntry {
			items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.entryTemplateListItems = items
	return items
}

// GetTemplateListItems returns the template list items in ABC order.
// The list items are passed to the list component.
// If the list items have already been generated, it returns the cached list items.
// Otherwise, it generates the list items and returns them.
func (t *templates) GetTemplateListItems() []components.ListItem {
	if t.templateListItems != nil {
		return t.templateListItems
	}

	items := []components.ListItem{}
	for _, template := range t.templates {
		items = append(items, components.ListItem{Id: template.Id, Option: template.Name})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Id < items[j].Id
	})
	t.templateListItems = items
	return items
}
