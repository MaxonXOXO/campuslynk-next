<?php

arch('app does not use debugging functions')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('app does not access env directly outside config')
    ->expect('env')
    ->not->toBeUsed();

test('backend/app does not contain legacy string academic-suite', function () {
    $findPhpFiles = function (string $dir) use (&$findPhpFiles): array {
        $files = [];
        $items = glob($dir.'/*', GLOB_NOSORT) ?: [];
        foreach ($items as $item) {
            if (is_dir($item)) {
                $files = array_merge($files, $findPhpFiles($item));
            } elseif (str_ends_with($item, '.php')) {
                $files[] = $item;
            }
        }

        return $files;
    };

    $appDir = realpath(__DIR__.'/../../app');
    expect($appDir)->not->toBeFalse();

    $phpFiles = $findPhpFiles((string) $appDir);
    expect($phpFiles)->not->toBeEmpty();

    $violations = [];
    foreach ($phpFiles as $file) {
        $content = (string) file_get_contents($file);
        if (str_contains($content, 'academic-suite')) {
            $violations[] = basename($file);
        }
    }

    expect($violations)->toBeEmpty(
        'Files under backend/app containing "academic-suite": '.implode(', ', $violations)
    );
});
