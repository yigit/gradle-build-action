import * as provision from '../src/provision'
import * as path from 'path'

describe('provision', () => {
    describe('can resolve Gradle version', () => {
        it('explicit GA', async () => {
            const info = await provision.findGradleVersionDeclaration('6.7.1')
            expect(info?.version).toBe('6.7.1')
        })
        it('explicit milestone', async () => {
            const info = await provision.findGradleVersionDeclaration(
                '6.8-milestone-1'
            )
            expect(info?.version).toBe('6.8-milestone-1')
        })
        it('explicit RC', async () => {
            const info = await provision.findGradleVersionDeclaration(
                '6.8-rc-4'
            )
            expect(info?.version).toBe('6.8-rc-4')
        })
        it('nightly', async () => {
            const info = await provision.findGradleNightly()
            expect(info?.version).toMatch(/.*\+0000/)
        })
        it('release nightly', async () => {
            const info = await provision.findGradleReleaseNightly()
            expect(info?.version).toMatch(/.*\+0000/)
        })
    })
})
