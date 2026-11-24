using System;

class Program
{
    static void Main()
    {
        int sp = int.Parse(Console.ReadLine());
        int sc = int.Parse(Console.ReadLine());
        int dp = int.Parse(Console.ReadLine());
        int dc = int.Parse(Console.ReadLine());
        int paid = int.Parse(Console.ReadLine());
        int total = sp * sc + dp * dc;
        int change = paid - total;
        Console.WriteLine("סה\"כ: " + total);
        Console.WriteLine("עודף: " + change);
        Console.WriteLine("מטבעות של 10: " + change / 10 + ", נשאר: " + change % 10);
    }
}
