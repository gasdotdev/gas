package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	json             jsonType
	ContainerDirPath ContainerDirPathType
}

func New() (*Config, error) {
	c := &Config{}

	err := c.setJson()
	if err != nil {
		return nil, err
	}

	c.setContainerDirPath()

	return c, nil
}

type jsonType map[string]interface{}

func (c *Config) setJson() error {
	configPath := "gas.config.json"

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			c.json = jsonType{}
			return nil
		}
		return fmt.Errorf("failed to read gas.config.json: %w", err)
	}

	var result jsonType
	if err := json.Unmarshal(data, &result); err != nil {
		return fmt.Errorf("failed to parse gas.config.json: %w", err)
	}

	c.json = result

	return nil
}

type ContainerDirPathType string

func (c *Config) setContainerDirPath() {
	if dirPath, ok := c.json["resourceContainerDirPath"].(string); ok {
		c.ContainerDirPath = ContainerDirPathType(dirPath)
	}
	c.ContainerDirPath = ContainerDirPathType("./gas")
}
