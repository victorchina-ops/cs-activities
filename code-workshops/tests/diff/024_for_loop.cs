using System;

class Program
{
    static void Main()
    {
        for (int i = 0; i < 5; i++) Console.Write(i + " ");
        Console.WriteLine();
        for (int i = 10; i > 0; i = i - 3) Console.Write(i + ",");
        Console.WriteLine();
        int total = 0;
        for (int i = 1; i <= 100; i++) total = total + i * i;
        Console.WriteLine(total);
        for (int i = 0, j = 10; i < j; i++, j--) Console.Write(i * j + " ");
        Console.WriteLine();
        for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) Console.Write(i * j); Console.WriteLine(); }
    }
}
