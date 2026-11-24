<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;
use SplFileObject;
use ZipArchive;

final class StaffImportParser
{
    public const MAX_ROWS = 1000;

    public const MAX_UNCOMPRESSED_XLSX_BYTES = 26214400; // 25 MB

    /** @var list<string> */
    public const TEMPLATE_HEADERS = [
        'name',
        'email',
        'mobile',
        'registration_number',
        'requested_department_code',
        'designation',
        'employee_id',
    ];

    /**
     * Parse an uploaded CSV or XLSX file directly into plain-text associative rows (no disk staging).
     *
     * @return list<array{row_number: int, data: array<string, string>}>
     */
    public function parse(UploadedFile $file): array
    {
        $ext = strtolower($file->getClientOriginalExtension());
        $path = $file->getRealPath();

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages(['file' => ['Unable to read uploaded file.']]);
        }

        if ($ext === 'xlsx') {
            $this->guardXlsxUncompressedSize($path);

            return $this->parseXlsx($path);
        }

        return $this->parseCsv($path);
    }

    private function guardXlsxUncompressedSize(string $path): void
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            throw ValidationException::withMessages(['file' => ['Invalid or corrupted XLSX archive.']]);
        }

        $totalSize = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (is_array($stat)) {
                $totalSize += (int) $stat['size'];
            }
            if ($totalSize > self::MAX_UNCOMPRESSED_XLSX_BYTES) {
                $zip->close();
                throw ValidationException::withMessages([
                    'file' => ['XLSX uncompressed content exceeds the 25 MB safety limit.'],
                ]);
            }
        }
        $zip->close();
    }

    /**
     * @return list<array{row_number: int, data: array<string, string>}>
     */
    private function parseCsv(string $path): array
    {
        $csv = new SplFileObject($path, 'r');
        $csv->setFlags(SplFileObject::READ_CSV | SplFileObject::SKIP_EMPTY | SplFileObject::DROP_NEW_LINE);

        $headers = null;
        $rows = [];
        $rowNum = 0;

        foreach ($csv as $rawRow) {
            if (! is_array($rawRow)) {
                continue;
            }
            $cells = array_values(array_map(fn ($v): string => $this->normalizePlainText($v), $rawRow));
            if (implode('', $cells) === '') {
                continue;
            }

            if ($headers === null) {
                $headers = $this->normalizeHeaders($cells);

                continue;
            }

            $rowNum++;
            if ($rowNum > self::MAX_ROWS) {
                throw ValidationException::withMessages([
                    'file' => ['Import exceeds the maximum of '.self::MAX_ROWS.' data rows.'],
                ]);
            }

            $rows[] = [
                'row_number' => $rowNum + 1,
                'data' => $this->combineRow($headers, $cells),
            ];
        }

        if ($headers === null) {
            throw ValidationException::withMessages(['file' => ['Uploaded file is empty.']]);
        }

        return $rows;
    }

    /**
     * @return list<array{row_number: int, data: array<string, string>}>
     */
    private function parseXlsx(string $path): array
    {
        $reader = new XlsxReader;
        $reader->open($path);

        $headers = null;
        $rows = [];
        $rowNum = 0;

        try {
            foreach ($reader->getSheetIterator() as $sheet) {
                foreach ($sheet->getRowIterator() as $row) {
                    $cells = array_values(array_map(
                        fn ($cell): string => $this->normalizePlainText($cell->getValue()),
                        $row->cells
                    ));
                    if (implode('', $cells) === '') {
                        continue;
                    }

                    if ($headers === null) {
                        $headers = $this->normalizeHeaders($cells);

                        continue;
                    }

                    $rowNum++;
                    if ($rowNum > self::MAX_ROWS) {
                        throw ValidationException::withMessages([
                            'file' => ['Import exceeds the maximum of '.self::MAX_ROWS.' data rows.'],
                        ]);
                    }

                    $rows[] = [
                        'row_number' => $rowNum + 1,
                        'data' => $this->combineRow($headers, $cells),
                    ];
                }
                break; // First worksheet only
            }
        } finally {
            $reader->close();
        }

        if ($headers === null) {
            throw ValidationException::withMessages(['file' => ['Uploaded worksheet is empty.']]);
        }

        return $rows;
    }

    /**
     * @param  list<string>  $cells
     * @return list<string>
     */
    private function normalizeHeaders(array $cells): array
    {
        $normalized = array_map(
            fn (string $h): string => strtolower(trim(str_replace("\xEF\xBB\xBF", '', $h))),
            $cells
        );

        if (! in_array('name', $normalized, true)) {
            throw ValidationException::withMessages([
                'file' => ['Missing required header column: name.'],
            ]);
        }

        return $normalized;
    }

    /**
     * @param  list<string>  $headers
     * @param  list<string>  $cells
     * @return array<string, string>
     */
    private function combineRow(array $headers, array $cells): array
    {
        $assoc = [];
        foreach ($headers as $idx => $key) {
            if ($key === '') {
                continue;
            }
            $assoc[$key] = $cells[$idx] ?? '';
        }

        return $assoc;
    }

    private function normalizePlainText(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (! is_scalar($value)) {
            return '';
        }

        return trim((string) $value);
    }
}
