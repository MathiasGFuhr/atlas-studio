import assert from 'node:assert/strict'
import { isExactDeleteAction, isViewTrashLabel } from './deleteMenuContract.mjs'

assert.equal(isExactDeleteAction('Excluir'), true)
assert.equal(isExactDeleteAction('Excluir projeto'), true)
assert.equal(isExactDeleteAction('Delete'), true)
assert.equal(isViewTrashLabel('Ver lixeira'), true)
assert.equal(isExactDeleteAction('Ver lixeira'), false)
assert.equal(isExactDeleteAction('Renomear'), false)
assert.equal(isExactDeleteAction('deletebin Excluir'), true)

console.log('deleteMenuContract ok')
