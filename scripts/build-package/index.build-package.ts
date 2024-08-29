import * as esbuild from 'esbuild'
import { promises as fs } from 'fs'
import path from 'path'

await main()

async function main() {
    const entry = process.argv[2]
    const watch = process.argv.includes('--watch')

    if (!entry) {
        console.error('Provide a build entry as the first argument')
        process.exit(1)
    }

    try {
        const buildDir = './build'
        await fs.rm(buildDir, { recursive: true, force: true })
        await fs.mkdir(buildDir, { recursive: true })

        const packageJsonPath = path.join(process.cwd(), 'package.json')
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
        const packageJson = JSON.parse(packageJsonContent)

        const dependencies = packageJson.dependencies ? Object.keys(packageJson.dependencies) : []

        const ctx = await esbuild.context({
            entryPoints: [entry],
            bundle: true,
            outfile: path.join(buildDir, entry.replace('.ts', '.js')),
            platform: 'node',
            format: 'esm',
            target: 'node20',
            sourcemap: 'external',
            external: dependencies,
        })

        if (watch) {
            await ctx.watch()
            console.log(`Watching: ${process.cwd()}/${entry}`)
        } else {
            await ctx.rebuild()
            console.log(`Build succeeded: ${process.cwd()}/${entry}`)
            await ctx.dispose()
        }
    } catch (error) {
        console.error(error)
    }
}