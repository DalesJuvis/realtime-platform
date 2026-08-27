/**
 * # TemplatesPage
 *
 * CRUD for reusable message bodies used by the Broadcasting page.
 * `{{variable}}` placeholders are a display-only convention on this side —
 * the backend stores `body` as opaque text (see `TemplateDto`'s doc comment).
 */

import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileText, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { useDialog } from '@providers/DialogProvider'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { createTemplateAction } from '@actions/templates/createTemplate.action'
import { updateTemplateAction } from '@actions/templates/updateTemplate.action'
import { deleteTemplateAction } from '@actions/templates/deleteTemplate.action'
import { errorMessage } from '@lib/errors'
import { formatDateTime } from '@lib/utils'
import type { Template } from '@entities/Template.entity'

export default function TemplatesPage() {
  const dialog = useDialog()
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [isSaving, setSaving] = useState(false)
  const [isFormOpen, setFormOpen] = useState(false)

  function load() {
    getTemplatesAction()
      .then(setTemplates)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load templates.')))
  }

  useEffect(load, [])

  function openCreate() {
    setEditing(null)
    setName('')
    setBody('')
    setFormOpen(true)
  }

  function openEdit(template: Template) {
    setEditing(template)
    setName(template.name)
    setBody(template.body)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateTemplateAction(editing.id, { name: name.trim(), body })
        toast.success('Template updated.')
      } else {
        await createTemplateAction({ name: name.trim(), body })
        toast.success('Template created.')
      }
      closeForm()
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save template.'))
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(template: Template) {
    dialog.openDialog(
      <ConfirmDialog
        message={`Delete "${template.name}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await deleteTemplateAction(template.id)
            toast.success('Template deleted.')
            load()
          } catch (err) {
            toast.error(errorMessage(err, 'Failed to delete template.'))
          }
        }}
      />,
      { title: 'Delete template' },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">Reusable message bodies for the Broadcasting page.</p>
        </div>
        {!isFormOpen && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New template
          </Button>
        )}
      </div>

      {isFormOpen && (
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{editing ? 'Edit template' : 'New template'}</CardTitle>
            <Button variant="ghost" size="icon" onClick={closeForm} type="button">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="templateName">Name</Label>
                <Input id="templateName" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="templateBody">Body</Label>
                <Textarea
                  id="templateBody"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{name}}, your order has shipped!"
                  rows={4}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save template'}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {templates && templates.length === 0 && !isFormOpen ? (
        <Card className="shadow-none">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No templates yet — create one to reuse it from Broadcasting.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(templates ?? []).map((template) => (
            <Card key={template.id} className="shadow-none">
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {template.name}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Template actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(template)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => confirmDelete(template)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">{template.body}</p>
                <p className="mt-3 text-xs text-muted-foreground">Updated {formatDateTime(template.updated_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
