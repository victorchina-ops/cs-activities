using System;

class Program
{
    static void Main()
    {
        int i = 0;
        do { i++; if (i == 2) continue; if (i > 5) break; Console.Write(i + " "); } while (true);
        Console.WriteLine();
        for (int j = 0; j < 10; j++) { if (j % 2 == 0) continue; if (j > 7) break; Console.Write(j); }
        Console.WriteLine();
        int k = 0;
        while (true) { k++; if (k >= 4) break; }
        Console.WriteLine(k);
        int q;
        while (true) { q = 5; break; }
        Console.WriteLine(q);
    }
}
