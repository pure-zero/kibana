/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiHorizontalRule,
  EuiModalBody,
  EuiModalFooter,
  EuiButtonEmpty,
  EuiButton,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  useGeneratedHtmlId,
  EuiFormRow,
  useEuiTheme,
} from '@elastic/eui';
import { i18n as I18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  AnonymizationFieldResponse,
  PerformAnonymizationFieldsBulkActionRequestBody,
} from '@kbn/elastic-assistant-common/impl/schemas';
import { find, uniqBy } from 'lodash';
import { Stats } from '../stats';
import * as i18n from '../../data_anonymization/settings/anonymization_settings/translations';
import { SelectedPromptContext } from '../../assistant/prompt_context/types';
import { BatchUpdateListItem } from '../context_editor/types';
import { updateSelectedPromptContext, getIsDataAnonymizable } from '../helpers';
import { useAssistantContext } from '../../assistant_context';

import { bulkUpdateAnonymizationFields } from '../../assistant/api/anonymization_fields/bulk_update_anonymization_fields';
import { ContextEditor } from './context_editor';
import { useFetchAnonymizationFields } from '../../assistant/api/anonymization_fields/use_fetch_anonymization_fields';

export interface Props {
  onClose: () => void;
  onSave: (updates: BatchUpdateListItem[]) => void;
  promptContext: SelectedPromptContext;
}

const SelectedPromptContextEditorModalComponent = ({ onClose, onSave, promptContext }: Props) => {
  const { euiTheme } = useEuiTheme();
  const { http, toasts } = useAssistantContext();

  const [checked, setChecked] = useState(false);
  const checkboxId = useGeneratedHtmlId({ prefix: 'updateSettingPresetsCheckbox' });

  const { data: anonymizationAllFields, refetch: anonymizationFieldsRefetch } =
    useFetchAnonymizationFields();
  const [contextUpdates, setContextUpdates] = React.useState<BatchUpdateListItem[]>([]);
  const [selectedPromptContext, setSelectedPromptContext] = React.useState(promptContext);
  const [anonymizationFieldsBulkActions, setAnonymizationFieldsBulkActions] =
    useState<PerformAnonymizationFieldsBulkActionRequestBody>({
      create: [],
      update: [],
      delete: {},
    });

  const isDataAnonymizable = useMemo<boolean>(
    () => getIsDataAnonymizable(selectedPromptContext.rawData),
    [selectedPromptContext.rawData]
  );

  const handleSave = useCallback(async () => {
    if (onSave) {
      onSave(contextUpdates);
    }
    try {
      await bulkUpdateAnonymizationFields(http, anonymizationFieldsBulkActions, toasts);
      anonymizationFieldsRefetch();
    } catch (e) {
      /* empty */
    }
    onClose();
  }, [
    anonymizationFieldsBulkActions,
    anonymizationFieldsRefetch,
    contextUpdates,
    http,
    onClose,
    onSave,
    toasts,
  ]);

  const onListUpdated = useCallback(
    (updates: BatchUpdateListItem[]) => {
      setContextUpdates((prev) => [...prev, ...updates]);

      setAnonymizationFieldsBulkActions((prev) => {
        return updates.reduce<PerformAnonymizationFieldsBulkActionRequestBody>(
          (acc, item) => {
            const persistedField = find(anonymizationAllFields.data, ['field', item.field]) as
              | AnonymizationFieldResponse
              | undefined;

            if (persistedField) {
              acc.update?.push({
                id: persistedField.id,
                ...(item.update === 'allow' || item.update === 'defaultAllow'
                  ? { allowed: item.operation === 'add' }
                  : {}),
                ...(item.update === 'allowReplacement' || item.update === 'defaultAllowReplacement'
                  ? { anonymized: item.operation === 'add' }
                  : {}),
              });
            } else {
              acc.create?.push({
                field: item.field,
                allowed:
                  item.operation === 'add' &&
                  (item.update === 'allow' || item.update === 'defaultAllow'),
                anonymized:
                  item.operation === 'add' &&
                  (item.update === 'allowReplacement' || item.update === 'defaultAllowReplacement'),
              });
              acc.create = uniqBy(acc.create, 'field');
            }

            return acc;
          },
          { create: prev.create ?? [], update: prev.update ?? [] }
        );
      });

      setSelectedPromptContext((prev) => {
        return updates.reduce<SelectedPromptContext>(
          (acc, { field, operation, update }) =>
            updateSelectedPromptContext({
              field,
              operation,
              selectedPromptContext: acc,
              update,
            }),
          prev
        );
      });
    },
    [anonymizationAllFields.data]
  );

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked);
  }, []);

  return (
    <EuiModal onClose={onClose}>
      <EuiModalHeader
        css={css`
          flex-direction: column;
          align-items: flex-start;
          padding-bottom: 0;
        `}
      >
        <EuiModalHeaderTitle>{i18n.SETTINGS_TITLE}</EuiModalHeaderTitle>
        <EuiSpacer size="xs" />
        <EuiText size={'xs'}>{i18n.SETTINGS_DESCRIPTION}</EuiText>
        <EuiHorizontalRule margin="s" />
      </EuiModalHeader>

      <EuiModalBody>
        <Stats
          isDataAnonymizable={isDataAnonymizable}
          anonymizationFields={selectedPromptContext.contextAnonymizationFields?.data}
          rawData={selectedPromptContext.rawData}
        />
        <EuiSpacer size="s" />
        <ContextEditor
          anonymizationFields={
            selectedPromptContext.contextAnonymizationFields ?? {
              total: 0,
              page: 1,
              perPage: 1000,
              data: [],
              all: [],
            }
          }
          onListUpdated={onListUpdated}
          rawData={selectedPromptContext.rawData as Record<string, string[]>}
        />
      </EuiModalBody>

      <EuiModalFooter
        css={css`
          background: ${euiTheme.colors.backgroundBaseSubdued};
          padding-block: 16px;
        `}
      >
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiFormRow
              helpText={I18n.translate(
                'xpack.elasticAssistant.dataAnonymizationEditor.updatePresetsCheckboxHelpText',
                {
                  defaultMessage:
                    'Apply new anonymization settings for current & future conversations.',
                }
              )}
            >
              <EuiCheckbox
                id={checkboxId}
                label={I18n.translate(
                  'xpack.elasticAssistant.dataAnonymizationEditor.updatePresetsCheckboxLabel',
                  {
                    defaultMessage: 'Update presets',
                  }
                )}
                checked={checked}
                onChange={onChange}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem>
                <EuiButtonEmpty onClick={onClose} size="s">
                  {I18n.translate('xpack.elasticAssistant.dataAnonymizationEditor.closeButton', {
                    defaultMessage: 'Close',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiButton onClick={handleSave} fill size="s">
                  {I18n.translate('xpack.elasticAssistant.dataAnonymizationEditor.saveButton', {
                    defaultMessage: 'Save',
                  })}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
};

SelectedPromptContextEditorModalComponent.displayName = 'SelectedPromptContextEditor';

export const SelectedPromptContextEditorModal = React.memo(
  SelectedPromptContextEditorModalComponent
);
