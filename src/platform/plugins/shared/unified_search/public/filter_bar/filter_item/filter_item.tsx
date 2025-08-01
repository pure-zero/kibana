/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiContextMenu,
  EuiContextMenuPanel,
  EuiPopover,
  EuiPopoverProps,
  UseEuiTheme,
  euiShadowMedium,
} from '@elastic/eui';
import { InjectedIntl } from '@kbn/i18n-react';
import {
  Filter,
  isFilterPinned,
  toggleFilterNegated,
  toggleFilterPinned,
  toggleFilterDisabled,
} from '@kbn/es-query';
import classNames from 'classnames';
import React, { MouseEvent, useState, useEffect, HTMLAttributes, useCallback } from 'react';
import { type DocLinksStart, type IUiSettingsClient } from '@kbn/core/public';
import { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import { css } from '@emotion/react';
import { getIndexPatternFromFilter, getDisplayValueFromFilter } from '@kbn/data-plugin/public';
import { useMemoCss } from '../../use_memo_css';
import { FilterEditor } from '../filter_editor/filter_editor';
import { FilterView } from '../filter_view';
import { FilterPanelOption } from '../../types';
import {
  withCloseFilterEditorConfirmModal,
  WithCloseFilterEditorConfirmModalProps,
} from '../filter_editor';
import { SuggestionsAbstraction } from '../../typeahead/suggestions_component';

export interface FilterItemProps extends WithCloseFilterEditorConfirmModalProps {
  id: string;
  filter: Filter;
  indexPatterns: DataView[];
  className?: string;
  onUpdate: (filter: Filter) => void;
  onRemove: () => void;
  intl: InjectedIntl;
  uiSettings: IUiSettingsClient;
  docLinks: DocLinksStart;
  hiddenPanelOptions?: FilterPanelOption[];
  timeRangeForSuggestionsOverride?: boolean;
  filtersForSuggestions?: Filter[];
  readOnly?: boolean;
  suggestionsAbstraction?: SuggestionsAbstraction;
  filtersCount?: number;
  dataViews?: DataViewsContract;
}

type FilterPopoverProps = HTMLAttributes<HTMLDivElement> & EuiPopoverProps;

interface LabelOptions {
  title: string;
  status: FilterLabelStatus;
  message?: string;
}

const FILTER_ITEM_OK = '';
const FILTER_ITEM_WARNING = 'warn';
const FILTER_ITEM_ERROR = 'error';

export type FilterLabelStatus =
  | typeof FILTER_ITEM_OK
  | typeof FILTER_ITEM_WARNING
  | typeof FILTER_ITEM_ERROR;

export const FILTER_EDITOR_WIDTH = 1200;

function FilterItemComponent(props: FilterItemProps) {
  const { onCloseFilterPopover, onLocalFilterCreate, onLocalFilterUpdate } = props;
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const [renderedComponent, setRenderedComponent] = useState('menu');
  const { id, filter, indexPatterns, hiddenPanelOptions, readOnly = false, docLinks } = props;

  const styles = useMemoCss(filterItemStyles);

  const closePopover = useCallback(() => {
    onCloseFilterPopover([() => setIsPopoverOpen(false)]);
  }, [onCloseFilterPopover]);

  useEffect(() => {
    if (isPopoverOpen) {
      setRenderedComponent('menu');
    }
  }, [isPopoverOpen]);

  function handleBadgeClick(e: MouseEvent<HTMLInputElement>) {
    if (e.shiftKey) {
      onToggleDisabled();
    } else {
      setIsPopoverOpen(!isPopoverOpen);
    }
  }

  function handleIconClick() {
    props.onRemove();
    setIsPopoverOpen(false);
  }

  function onSubmit(f: Filter) {
    setIsPopoverOpen(false);
    props.onUpdate(f);
  }

  function onTogglePinned() {
    const f = toggleFilterPinned(filter);
    props.onUpdate(f);
  }

  function onToggleNegated() {
    const f = toggleFilterNegated(filter);
    props.onUpdate(f);
  }

  function onToggleDisabled() {
    const f = toggleFilterDisabled(filter);
    props.onUpdate(f);
  }

  function isValidLabel(labelConfig: LabelOptions) {
    return labelConfig.status === FILTER_ITEM_OK;
  }

  function isDisabled(labelConfig: LabelOptions) {
    const { disabled } = filter.meta;
    return disabled || labelConfig.status === FILTER_ITEM_ERROR;
  }

  function getClasses(negate: boolean, labelConfig: LabelOptions) {
    return classNames(
      'globalFilterItem',
      {
        'globalFilterItem-isDisabled': isDisabled(labelConfig),
        'globalFilterItem-isError': labelConfig.status === FILTER_ITEM_ERROR,
        'globalFilterItem-isWarning': labelConfig.status === FILTER_ITEM_WARNING,
        'globalFilterItem-isPinned': isFilterPinned(filter),
        'globalFilterItem-isExcluded': negate,
      },
      props.className
    );
  }

  function getDataTestSubj(labelConfig: LabelOptions) {
    const dataTestSubjKey = filter.meta.key ? `filter-key-${filter.meta.key}` : '';
    const valueLabel = isValidLabel(labelConfig) ? labelConfig.title : labelConfig.status;
    const dataTestSubjValue = valueLabel ? `filter-value-${valueLabel.replace(/\s/g, '')}` : '';
    const dataTestSubjNegated = filter.meta.negate ? 'filter-negated' : '';
    const dataTestSubjDisabled = `filter-${isDisabled(labelConfig) ? 'disabled' : 'enabled'}`;
    const dataTestSubjPinned = `filter-${isFilterPinned(filter) ? 'pinned' : 'unpinned'}`;
    const dataTestSubjId = `filter-id-${id}`;
    return classNames(
      'filter',
      dataTestSubjDisabled,
      dataTestSubjKey,
      dataTestSubjValue,
      dataTestSubjPinned,
      dataTestSubjNegated,
      dataTestSubjId
    );
  }

  function getPanels() {
    const { negate, disabled } = filter.meta;
    let mainPanelItems = [
      {
        name: isFilterPinned(filter)
          ? props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.unpinFilterButtonLabel',
              defaultMessage: 'Unpin',
            })
          : props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.pinFilterButtonLabel',
              defaultMessage: 'Pin across all apps',
            }),
        icon: 'pin',
        onClick: () => {
          setIsPopoverOpen(false);
          onTogglePinned();
        },
        'data-test-subj': 'pinFilter',
      },
      {
        name: props.intl.formatMessage({
          id: 'unifiedSearch.filter.filterBar.editFilterButtonLabel',
          defaultMessage: 'Edit filter',
        }),
        icon: 'pencil',
        'data-test-subj': 'editFilter',
        onClick: () => {
          setRenderedComponent('editFilter');
        },
      },
      {
        name: negate
          ? props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.includeFilterButtonLabel',
              defaultMessage: 'Include results',
            })
          : props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.excludeFilterButtonLabel',
              defaultMessage: 'Exclude results',
            }),
        icon: negate ? 'plusInCircle' : 'minusInCircle',
        onClick: () => {
          setIsPopoverOpen(false);
          onToggleNegated();
        },
        'data-test-subj': 'negateFilter',
      },
      {
        name: disabled
          ? props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.enableFilterButtonLabel',
              defaultMessage: 'Re-enable',
            })
          : props.intl.formatMessage({
              id: 'unifiedSearch.filter.filterBar.disableFilterButtonLabel',
              defaultMessage: 'Temporarily disable',
            }),
        icon: `${disabled ? 'eye' : 'eyeClosed'}`,
        onClick: () => {
          setIsPopoverOpen(false);
          onToggleDisabled();
        },
        'data-test-subj': 'disableFilter',
      },
      {
        name: props.intl.formatMessage({
          id: 'unifiedSearch.filter.filterBar.deleteFilterButtonLabel',
          defaultMessage: 'Delete',
        }),
        icon: 'trash',
        onClick: () => {
          setIsPopoverOpen(false);
          props.onRemove();
        },
        'data-test-subj': 'deleteFilter',
      },
    ];

    if (hiddenPanelOptions && hiddenPanelOptions.length > 0) {
      mainPanelItems = mainPanelItems.filter(
        (pItem) => !hiddenPanelOptions.includes(pItem['data-test-subj'] as FilterPanelOption)
      );
    }
    return [
      {
        id: 0,
        items: mainPanelItems,
      },
    ];
  }

  /**
   * Checks if filter field exists in any of the index patterns provided,
   * Because if so, a filter for the wrong index pattern may still be applied.
   * This function makes this behavior explicit, but it needs to be revised.
   */
  function isFilterApplicable() {
    // Any filter is applicable if no index patterns were provided to FilterBar.
    if (!props.indexPatterns.length) return true;

    const ip = getIndexPatternFromFilter(filter, indexPatterns);
    if (ip) return true;

    const allFields = indexPatterns.map((indexPattern) => {
      return indexPattern.fields.map((field) => field.name);
    });
    const flatFields = allFields.reduce((acc: string[], it: string[]) => [...acc, ...it], []);
    return flatFields.includes(filter.meta?.key || '');
  }

  function getValueLabel(): LabelOptions {
    const label: LabelOptions = {
      title: '',
      message: '',
      status: FILTER_ITEM_OK,
    };

    if (filter.meta?.isMultiIndex) {
      return label;
    }

    if (isFilterApplicable()) {
      try {
        label.title = getDisplayValueFromFilter(filter, indexPatterns);
      } catch (e) {
        label.status = FILTER_ITEM_WARNING;
        label.title = props.intl.formatMessage({
          id: 'unifiedSearch.filter.filterBar.labelWarningText',
          defaultMessage: `Warning`,
        });
        label.message = e.message;
      }
    } else {
      label.status = FILTER_ITEM_WARNING;
      label.title = props.intl.formatMessage({
        id: 'unifiedSearch.filter.filterBar.labelWarningText',
        defaultMessage: `Warning`,
      });
      label.message = props.intl.formatMessage(
        {
          id: 'unifiedSearch.filter.filterBar.labelWarningInfo',
          defaultMessage: 'Field {fieldName} does not exist in current view',
        },
        {
          fieldName: filter.meta.key,
        }
      );
    }

    return label;
  }

  const valueLabelConfig = getValueLabel();

  // Disable errored filters and re-render
  if (valueLabelConfig.status === FILTER_ITEM_ERROR && !filter.meta.disabled) {
    filter.meta.disabled = true;
    props.onUpdate(filter);
    return null;
  }

  const filterViewProps = {
    filter,
    readOnly,
    valueLabel: valueLabelConfig.title,
    filterLabelStatus: valueLabelConfig.status,
    errorMessage: valueLabelConfig.message,
    className: getClasses(!!filter.meta.negate, valueLabelConfig),
    css: styles.filterItem,
    dataViews: indexPatterns,
    iconOnClick: handleIconClick,
    onClick: handleBadgeClick,
    'data-test-subj': getDataTestSubj(valueLabelConfig),
  };

  const popoverProps: FilterPopoverProps = {
    id: `popoverFor_filter${id}`,
    display: 'block',
    isOpen: isPopoverOpen,
    closePopover,
    button: <FilterView {...filterViewProps} />,
    panelPaddingSize: 'none',
    panelProps: {
      css: styles.popoverDragAndDrop,
    },
  };

  return readOnly ? (
    <FilterView {...filterViewProps} />
  ) : (
    <EuiPopover anchorPosition="downLeft" {...popoverProps}>
      {renderedComponent === 'menu' ? (
        <EuiContextMenu initialPanelId={0} panels={getPanels()} />
      ) : (
        <EuiContextMenuPanel
          items={[
            <div css={styles.filterItemEditorContainer} key="filter-editor">
              <FilterEditor
                filter={filter}
                indexPatterns={indexPatterns}
                onSubmit={onSubmit}
                onLocalFilterUpdate={onLocalFilterUpdate}
                onLocalFilterCreate={onLocalFilterCreate}
                onCancel={() => setIsPopoverOpen(false)}
                timeRangeForSuggestionsOverride={props.timeRangeForSuggestionsOverride}
                filtersForSuggestions={props.filtersForSuggestions}
                suggestionsAbstraction={props.suggestionsAbstraction}
                docLinks={docLinks}
                filtersCount={props.filtersCount}
                dataViews={props.dataViews}
              />
            </div>,
          ]}
        />
      )}
    </EuiPopover>
  );
}

export const FilterItem = withCloseFilterEditorConfirmModal(FilterItemComponent);

const filterItemStyles = {
  /** @todo important style should be remove after fixing elastic/eui/issues/6314. */
  popoverDragAndDrop: (euiThemeContext: UseEuiTheme) =>
    css`
      // Always needed for popover with drag & drop in them
      transform: none !important;
      transition: none !important;
      filter: none !important;
      ${euiShadowMedium(euiThemeContext)}
    `,
  filterItemEditorContainer: ({ euiTheme }: UseEuiTheme) =>
    css({
      width: FILTER_EDITOR_WIDTH,
      maxWidth: '100%',
    }),
  filterItem: ({ euiTheme }: UseEuiTheme) =>
    css({
      lineHeight: euiTheme.size.base,
      color: euiTheme.colors.text,
      paddingBlock: `calc(${euiTheme.size.m} / 2)`,
      whiteSpace: 'normal',
      borderColor: euiTheme.colors.borderBasePlain,
      '&:not(.globalFilterItem-isDisabled)': {
        borderColor: euiTheme.colors.borderBasePlain,
      },
      '&.globalFilterItem-isExcluded': {
        borderColor: euiTheme.colors.borderBaseDanger,
        '&::before': {
          backgroundColor: euiTheme.colors.backgroundFilledDanger,
        },
      },
      '&.globalFilterItem-isDisabled': {
        color: euiTheme.colors.darkShade,
        backgroundColor: euiTheme.colors.disabled,
        borderColor: 'transparent',
        textDecoration: 'line-through',
        fontWeight: euiTheme.font.weight.regular,
      },
      '&.globalFilterItem-isError, &.globalFilterItem-isWarning': {
        '.globalFilterLabel__value': {
          fontWeight: euiTheme.font.weight.bold,
        },
      },
      '&.globalFilterItem-isError': {
        '.globalFilterLabel__value': {
          color: euiTheme.colors.dangerText,
        },
      },
      '&.globalFilterItem-isWarning': {
        '.globalFilterLabel__value': {
          color: euiTheme.colors.warningText,
        },
      },
      '&.globalFilterItem-isPinned': {
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: "''",
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: euiTheme.size.xs,
          backgroundColor: euiTheme.colors.mediumShade,
        },
      },
    }),
};
