package resources

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gasdotdev/gas/tui/internal/graph"
)

type Resources struct {
	NameToConfig nameToConfig
}

func New() (*Resources, error) {
	r := &Resources{}

	configJson, err := getConfigJson()
	if err != nil {
		return nil, err
	}

	containerDir := getContainerDirPath(configJson)

	containerSubdirPaths, err := getContainerSubdirPaths(containerDir)
	if err != nil {
		return nil, err
	}

	nameToPackageJson, err := getNameToPackageJson(containerSubdirPaths)
	if err != nil {
		return nil, err
	}

	packageJsonNameToName := setPackageJsonNameToName(nameToPackageJson)

	nameToDeps := r.setNameToDeps(nameToPackageJson, packageJsonNameToName)

	nameToIndexFilePath, err := r.setNameToIndexFilePath(containerSubdirPaths)
	if err != nil {
		return nil, err
	}

	nameToIndexFileContent, err := r.setNameToIndexFileContent(nameToIndexFilePath)
	if err != nil {
		return nil, err
	}

	g := graph.New(graph.NodeToDeps(nameToDeps))

	groupToDepthToNames := g.GroupToDepthToNodes

	// namesWithInDegreesOfZero := g.NodesWithInDegreesOfZero

	// nameToIntermediates := g.NodeToIntermediates

	// depthToName := g.DepthToNode

	// nameToDepth := g.NodeToDepth

	nameToConfigData, err := r.setNameToConfigData(nameToIndexFileContent)
	if err != nil {
		return nil, err
	}

	nodeJsConfigScript, err := r.setNodeJsConfigScript(nameToConfigData, groupToDepthToNames)
	if err != nil {
		return nil, err
	}

	runNodeJsConfigScriptResult, err := r.runNodeJsConfigScript(nodeJsConfigScript)
	if err != nil {
		return nil, err
	}

	nameToConfig := r.setNameToConfig(runNodeJsConfigScriptResult)

	r.NameToConfig = nameToConfig

	return r, nil
}

type configJson map[string]interface{}

func getConfigJson() (configJson, error) {
	configPath := "gas.config.json"

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return configJson{}, nil
		}
		return nil, fmt.Errorf("failed to read gas.config.json: %w", err)
	}

	var result configJson
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to parse gas.config.json: %w", err)
	}

	return result, nil
}

type containerDirPath string

func getContainerDirPath(configJson configJson) containerDirPath {
	if dirPath, ok := configJson["resourceContainerDirPath"].(string); ok {
		return containerDirPath(dirPath)
	}

	return containerDirPath("./gas")
}

type containerSubdirPaths []string

func getContainerSubdirPaths(containerDirPath containerDirPath) (containerSubdirPaths, error) {
	entries, err := os.ReadDir(string(containerDirPath))

	if err != nil {
		return nil, fmt.Errorf("unable to read resource container dir %s", containerDirPath)
	}

	var containerSubdirPaths containerSubdirPaths

	for _, entry := range entries {
		if entry.IsDir() {
			containerSubdirPaths = append(containerSubdirPaths, filepath.Join(string(containerDirPath), entry.Name()))
		}
	}

	return containerSubdirPaths, nil
}

type nameToPackageJson map[string]*packageJson

type packageJson struct {
	Name            string            `json:"name"`
	Main            string            `json:"main"`
	Types           string            `json:"types"`
	Scripts         map[string]string `json:"scripts"`
	Dependencies    map[string]string `json:"dependencies,omitempty"`
	DevDependencies map[string]string `json:"devDependencies,omitempty"`
}

func getNameToPackageJson(containerSubdirPaths containerSubdirPaths) (nameToPackageJson, error) {
	nameToPackageJson := make(nameToPackageJson)

	for _, subdirPath := range containerSubdirPaths {
		resourceName := convertContainerSubdirPathToName(subdirPath)

		packageJsonPath := filepath.Join(subdirPath, "package.json")

		data, err := os.ReadFile(packageJsonPath)
		if err != nil {
			return nil, fmt.Errorf("unable to read file %s\n%v", packageJsonPath, err)
		}

		var packageJson packageJson
		err = json.Unmarshal(data, &packageJson)
		if err != nil {
			return nil, fmt.Errorf("unable to parse %s\n%v", packageJsonPath, err)
		}

		nameToPackageJson[resourceName] = &packageJson
	}

	return nameToPackageJson, nil
}

func convertContainerSubdirPathToName(subdirPath string) string {
	subdirName := filepath.Base(subdirPath)
	snakeCaseResourceName := strings.ReplaceAll(subdirName, "-", "_")
	screamingSnakeCaseResourceName := strings.ToUpper(snakeCaseResourceName)
	return screamingSnakeCaseResourceName
}

type packageJsonNameToName map[string]string

func setPackageJsonNameToName(nameToPackageJson nameToPackageJson) packageJsonNameToName {
	result := make(packageJsonNameToName)
	for resourceName, packageJson := range nameToPackageJson {
		result[packageJson.Name] = resourceName
	}
	return result
}

type nameToDeps map[string][]string

func (r *Resources) setNameToDeps(nameToPackageJson nameToPackageJson, packageJsonNameToName packageJsonNameToName) nameToDeps {
	result := make(nameToDeps)
	for resourceName, packageJson := range nameToPackageJson {
		var deps []string
		// Loop over source resource's package.json deps
		for dep := range packageJson.Dependencies {
			internalDep, ok := packageJsonNameToName[dep]
			// If package.json dep exists in map then it's an internal dep
			if ok {
				deps = append(deps, internalDep)
			}
		}
		result[resourceName] = deps
	}
	return result
}

type nameToIndexFilePath map[string]string

func (r *Resources) setNameToIndexFilePath(containerSubdirPaths containerSubdirPaths) (nameToIndexFilePath, error) {
	result := make(nameToIndexFilePath)

	indexFilePathPattern := regexp.MustCompile(`^_[^.]+\.[^.]+\.[^.]+\.index\.ts$`)

	for _, subdirPath := range containerSubdirPaths {
		subdirName := filepath.Base(subdirPath)
		snakeCaseResourceName := strings.ReplaceAll(subdirName, "-", "_")
		screamingSnakeCaseResourceName := strings.ToUpper(snakeCaseResourceName)

		srcPath := filepath.Join(subdirPath, "src")

		files, err := os.ReadDir(srcPath)
		if err != nil {
			return nil, err
		}

		for _, file := range files {
			if !file.IsDir() && indexFilePathPattern.MatchString(file.Name()) {
				result[screamingSnakeCaseResourceName] = filepath.Join(srcPath, file.Name())
				break
			}
		}
	}

	return result, nil
}

type nameToIndexFileContent map[string]string

func (r *Resources) setNameToIndexFileContent(nameToIndexFilePath nameToIndexFilePath) (nameToIndexFileContent, error) {
	result := make(nameToIndexFileContent)
	for name, indexFilePath := range nameToIndexFilePath {
		data, err := os.ReadFile(indexFilePath)
		if err != nil {
			return nil, fmt.Errorf("unable to read file %s\n%v", indexFilePath, err)
		}
		result[name] = string(data)
	}
	return result, nil
}

type nameToConfigData map[string]*configData

type configData struct {
	variableName string
	functionName string
	exportString string
}

func (r *Resources) setNameToConfigData(nameToIndexFileContent nameToIndexFileContent) (nameToConfigData, error) {
	result := make(nameToConfigData)

	for name, indexFileContent := range nameToIndexFileContent {
		// Config setters are imported like this:
		// import { cloudflareKv } from "@gasoline-dev/resources"
		// They can be distinguished using a camelCase pattern.
		configSetterFunctionNameRegex := regexp.MustCompile(`import\s+\{[^}]*\b([a-z]+[A-Z][a-zA-Z]*)\b[^}]*\}\s+from\s+['"]@gasoline-dev/resources['"]`)
		// This can be limited to one match because there should only
		// be one config setter per resource index file.
		configSetterFunctionName := configSetterFunctionNameRegex.FindStringSubmatch(indexFileContent)[1]

		// Configs are exported like this:
		// export const coreBaseKv = cloudflareKv({
		//   name: "CORE_BASE_KV",
		// } as const)
		exportedConfigRegex := regexp.MustCompile(`(?m)export\s+const\s+\w+\s*=\s*\w+\([\s\S]*?\)\s*(?:as\s*const\s*)?;?`)

		// It can't be assumed that text that matches the exported config
		// pattern is an exported config. A user can export non-configs
		// using the same pattern above. So we need to collect possible
		// exported configs and evaluate them later.
		possibleExportedConfigs := exportedConfigRegex.FindAllString(indexFileContent, -1)

		// This regex matches the variable name of an exported
		// config. For example, it'd match "coreBaseKv" in:
		// export const coreBaseKv = cloudflareKv({
		//   name: "CORE_BASE_KV",
		// } as const)
		possibleExportedConfigVariableNameRegex := regexp.MustCompile(`export\s+const\s+(\w+)\s*=\s*\w+\(`)

		// This regex matches the function name of an exported
		// config. For example, it'd match "cloudflareKv" in:
		// export const coreBaseKv = cloudflareKv({
		//   name: "CORE_BASE_KV",
		// } as const)
		functionNameRegex := regexp.MustCompile(`\s*=\s*(\w+)\(`)

		for _, possibleExportedConfig := range possibleExportedConfigs {
			possibleExportedConfigFunctionName := functionNameRegex.FindStringSubmatch(possibleExportedConfig)[1]

			// If possible exported config function name is equal to the
			// config setter function name, then the possible exported
			// config function name and possible exported config are
			// confirmed to represent actual configs.
			if possibleExportedConfigFunctionName == configSetterFunctionName {
				result[name] = &configData{
					variableName: possibleExportedConfigVariableNameRegex.FindStringSubmatch(possibleExportedConfig)[1],
					functionName: possibleExportedConfigFunctionName,
					exportString: possibleExportedConfig,
				}
				break
			}
		}
	}
	return result, nil
}

type nodeJsConfigScript = string

func (r *Resources) setNodeJsConfigScript(nameToConfigData nameToConfigData, groupToDepthToNames graph.GroupToDepthToNodes) (nodeJsConfigScript, error) {
	var functionNames []string

	functionNameToTrue := make(map[string]bool)
	for _, configData := range nameToConfigData {
		functionNameToTrue[configData.functionName] = true
		functionNames = append(functionNames, configData.functionName)
	}

	result := "import {\n"
	result += strings.Join(functionNames, ",\n")
	result += "\n} "
	result += "from \"@gasoline-dev/resources\"\n"

	// Configs have to be written in bottom-up dependency order to
	// avoid Node.js "cannot access 'variable name' before
	// initialization" errors. For example, given a graph of A->B,
	// B's config has to be written before A's because A will
	// reference B's config.
	for group := range groupToDepthToNames {
		numOfDepths := len(groupToDepthToNames[group])
		for depth := numOfDepths; depth >= 0; depth-- {
			for _, name := range groupToDepthToNames[group][depth] {
				result += strings.Replace(nameToConfigData[name].exportString, " as const", "", 1)
				result += "\n"
			}
		}
	}

	result += "const resourceNameToConfig = {}\n"

	for name, configData := range nameToConfigData {
		result += fmt.Sprintf("resourceNameToConfig[\"%s\"] = %s\n", name, configData.variableName)
	}

	result += "console.log(JSON.stringify(resourceNameToConfig))\n"

	return result, nil
}

type runNodeJsConfigScriptResult map[string]interface{}

func (r *Resources) runNodeJsConfigScript(nodeJsConfigScript nodeJsConfigScript) (runNodeJsConfigScriptResult, error) {
	cmd := exec.Command("node", "--input-type=module")

	cmd.Stdin = bytes.NewReader([]byte(nodeJsConfigScript))

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("unable to execute Node.js config script: %s\n%v", string(output), err)
	}

	strOutput := strings.TrimSpace(string(output))

	var result runNodeJsConfigScriptResult
	err = json.Unmarshal([]byte(strOutput), &result)
	if err != nil {
		return nil, fmt.Errorf("unable to unmarshal Node.js config script result: %v", err)
	}

	return result, nil
}

type nameToConfig = map[string]interface{}

func (r *Resources) setNameToConfig(runNodeJsConfigScriptResult runNodeJsConfigScriptResult) nameToConfig {
	result := make(nameToConfig)
	for name, config := range runNodeJsConfigScriptResult {
		c := config.(map[string]interface{})
		resourceType := c["type"].(string)
		result[name] = configs[resourceType](config.(map[string]interface{}))
	}
	return result
}

var configs = map[string]func(config config) interface{}{
	"cloudflare-kv": func(config config) interface{} {
		return &CloudflareKVConfig{
			ConfigCommon: ConfigCommon{
				Type: config["type"].(string),
				Name: config["name"].(string),
			},
		}
	},
}

type config map[string]interface{}

type ConfigCommon struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type CloudflareKVConfig struct {
	ConfigCommon
}

type CloudflareWorkerConfig struct {
	ConfigCommon
	KV []struct {
		Binding string `json:"binding"`
	} `json:"kv"`
}
