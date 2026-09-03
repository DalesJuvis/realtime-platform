/**
 * # TemplatesPage
 *
 * CRUD for reusable message bodies used by the Broadcasting page.
 * `{{variable}}` placeholders are a display-only convention on this side —
 * the backend stores `body` as opaque text (see `TemplateDto`'s doc comment).
 */

import { type FormEvent, useMemo, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import { toast } from 'sonner'
import { Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { DataTable } from '@components/DataTable/DataTable'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { CopyButton } from '@components/shared/CopyButton'
import { useDialog } from '@providers/DialogProvider'
import { useIsDarkMode } from '@lib/useIsDarkMode'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { createTemplateAction } from '@actions/templates/createTemplate.action'
import { updateTemplateAction } from '@actions/templates/updateTemplate.action'
import { deleteTemplateAction } from '@actions/templates/deleteTemplate.action'
import { errorMessage } from '@lib/errors'
import { copyToClipboard, formatDateTime } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { Template } from '@entities/Template.entity'
import type { templates as templatesEn } from '@lib/i18n/en/templates'

function buildColumns(t: { templates: typeof templatesEn; common: { name: string } }): ColumnDef<Template>[] {
  return [
    {
      key: 'name',
      header: t.common.name,
      sortable: true,
      renderCell: (_v, row) => (
        <span className="flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          {row.name}
        </span>
      ),
    },
    {
      key: 'id',
      header: t.templates.columnId,
      // Used as `template_id` when publishing this template (from the
      // Broadcasting page, or a connected SDK's `publishTemplate()`) — a
      // dedicated, copyable column rather than only reachable from the
      // row-actions menu.
      renderCell: (_v, row) => (
        <div className="flex items-center gap-1">
          <span className="max-w-[10rem] truncate font-mono text-xs text-muted-foreground">{row.id}</span>
          <CopyButton value={row.id} label={t.templates.templateIdLabel} />
        </div>
      ),
    },
    {
      key: 'body',
      header: t.templates.columnBody,
      renderCell: (_v, row) => <span className="line-clamp-1 text-muted-foreground">{row.body}</span>,
    },
    {
      key: 'updated_at',
      header: t.templates.columnUpdated,
      sortable: true,
      renderCell: (_v, row) => formatDateTime(row.updated_at),
    },
  ]
}

// TinyMCE edits rich HTML, but `Template.body` is opaque plain text (see
// its own doc comment) that flows straight into the Broadcasting page's
// 211-byte, text-only wire payload — so formatting is a drafting aid
// only, never persisted. Block tags become newlines before the rest of
// the markup is stripped, since `textContent` alone collapses
// `<p>a</p><p>b</p>` into "ab" with no separator.
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<(p|div|li|br|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '')
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''
  return text.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trim()
}

// The reverse, for loading a plain-text template body back into the
// editor: escape it as text, then turn line breaks into <br> so they
// still read as line breaks visually.
function plainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br>')
}

/** Rendered inside the global dialog (see `useDialog`) rather than
 * `useState`-toggled inline — creating and editing share this one form. */
function TemplateForm({ editing, onSaved }: { editing: Template | null; onSaved: () => void }) {
  const dialog = useDialog()
  const isDarkMode = useIsDarkMode()
  const { t } = useTranslation()
  const [name, setName] = useState(editing?.name ?? '')
  const [bodyHtml, setBodyHtml] = useState(editing ? plainTextToHtml(editing.body) : '')
  const [isSaving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const body = htmlToPlainText(bodyHtml)
    if (!body) {
      toast.error(t.templates.bodyRequired)
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateTemplateAction(editing.id, { name: name.trim(), body })
        toast.success(t.templates.updated)
      } else {
        await createTemplateAction({ name: name.trim(), body })
        toast.success(t.templates.created)
      }
      dialog.closeAll()
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err, t.templates.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="templateName">{t.common.name}</Label>
        <Input id="templateName" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="templateBody">{t.templates.bodyLabel}</Label>
        <div className="overflow-hidden rounded-md border border-input">
          <Editor
            id="templateBody"
            tinymceScriptSrc="/tinymce/tinymce.min.js"
            licenseKey="gpl"
            value={bodyHtml}
            onEditorChange={setBodyHtml}
            init={{
              height: 200,
              menubar: false,
              statusbar: false,
              branding: false,
              plugins: 'lists link autolink',
              toolbar: 'bold italic underline | bullist numlist | link | removeformat',
              placeholder: t.templates.bodyPlaceholder,
              skin: isDarkMode ? 'oxide-dark' : 'oxide',
              content_css: isDarkMode ? 'dark' : 'default',
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t.templates.formattingCaption}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => dialog.closeAll()}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t.common.saving : t.templates.saveTemplate}
        </Button>
      </div>
    </form>
  )
}

export default function TemplatesPage() {
  const dialog = useDialog()
  const { t } = useTranslation()
  const [refreshKey, setRefreshKey] = useState(0)
  const source = useMemo(() => ({ type: 'request' as const, fn: getTemplatesAction }), [])
  const columns = useMemo(() => buildColumns(t), [t])

  function openCreate() {
    dialog.openDialog(<TemplateForm editing={null} onSaved={() => setRefreshKey((k) => k + 1)} />, {
      title: t.templates.newTemplate,
      size: 'lg',
    })
  }

  function openEdit(template: Template) {
    dialog.openDialog(<TemplateForm editing={template} onSaved={() => setRefreshKey((k) => k + 1)} />, {
      title: t.templates.editTitle,
      size: 'lg',
    })
  }

  function confirmDelete(template: Template) {
    dialog.openDialog(
      <ConfirmDialog
        message={t.templates.deleteConfirmMessage(template.name)}
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          try {
            await deleteTemplateAction(template.id)
            toast.success(t.templates.deleted)
            setRefreshKey((k) => k + 1)
          } catch (err) {
            toast.error(errorMessage(err, t.templates.deleteFailed))
          }
        }}
      />,
      { title: t.templates.deleteTitle },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.templates.pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.templates.pageSubtitle}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t.templates.newTemplate}
        </Button>
      </div>

      <DataTable
        source={source}
        refreshKey={refreshKey}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="templates"
        rowActions={(row) => [
          {
            label: t.templates.copyId,
            icon: Copy,
            onClick: async () => {
              try {
                await copyToClipboard(row.id)
                toast.success(t.common.copied(t.templates.templateIdLabel))
              } catch {
                toast.error(t.common.copyFailed(t.templates.templateIdLabel))
              }
            },
          },
          {
            label: t.common.edit,
            icon: Pencil,
            onClick: () => openEdit(row),
          },
          {
            label: t.common.delete,
            icon: Trash2,
            variant: 'destructive',
            onClick: () => confirmDelete(row),
          },
        ]}
        renderEmpty={() => (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6" />
            {t.templates.emptyState}
          </div>
        )}
      />
    </div>
  )
}
